import { TraceMap, originalPositionFor, type EncodedSourceMap } from "@jridgewell/trace-mapping";
import type { Sql, TransactionSql } from "postgres";

const MAX_FRAMES = 50;

// V8: "    at fn (https://x/app-abc.js:1:234)" or "    at https://x/app-abc.js:1:234"
const V8_FRAME = /^(\s*at\s+)(?:(.+?)\s+\()?(.+?):(\d+):(\d+)(\)?)\s*$/;
// Firefox/Safari: "fn@https://x/app-abc.js:1:234" or "@https://x/app-abc.js:1:234"
const GECKO_FRAME = /^(\s*)([^@\s]*)@(.+?):(\d+):(\d+)\s*$/;

interface ParsedFrame {
  functionName: string | null;
  file: string;
  line: number;
  column: number;
  style: "v8" | "gecko";
  indent: string;
}

function parseFrame(rawLine: string): ParsedFrame | null {
  const v8 = V8_FRAME.exec(rawLine);
  if (v8) {
    const [, indent, fn, file, line, column] = v8;
    if (!file || !line || !column) return null;
    return {
      functionName: fn ?? null,
      file,
      line: Number(line),
      column: Number(column),
      style: "v8",
      indent: indent ?? "",
    };
  }
  const gecko = GECKO_FRAME.exec(rawLine);
  if (gecko) {
    const [, indent, fn, file, line, column] = gecko;
    if (!file || !line || !column) return null;
    return {
      functionName: fn || null,
      file,
      line: Number(line),
      column: Number(column),
      style: "gecko",
      indent: indent ?? "",
    };
  }
  return null;
}

function baseName(file: string): string {
  const withoutQuery = file.split(/[?#]/)[0] ?? file;
  const segments = withoutQuery.split(/[\\/]/);
  return segments[segments.length - 1] ?? withoutQuery;
}

export interface SymbolicationResult {
  stack: string;
  symbolicated: boolean;
}

/**
 * Best-effort rewrite of a minified stack to original source positions using
 * source maps previously uploaded for (projectId, release). Unmatched frames
 * are left untouched; any failure returns the input stack unchanged. Must
 * never throw — symbolication can never be allowed to block ingest.
 */
export async function symbolicateStack(
  sql: Sql | TransactionSql,
  projectId: string,
  release: string,
  stack: string,
): Promise<SymbolicationResult> {
  try {
    const lines = stack.split("\n");
    const frames = lines
      .slice(0, MAX_FRAMES)
      .map((line, index) => ({ index, parsed: parseFrame(line) }))
      .filter((entry): entry is { index: number; parsed: ParsedFrame } => entry.parsed !== null);
    if (frames.length === 0) return { stack, symbolicated: false };

    const fileNames = [...new Set(frames.map((frame) => baseName(frame.parsed.file)))];
    const mapRows = await sql<Array<{ file_name: string; map: unknown }>>`
      SELECT file_name, map
      FROM release_sourcemaps
      WHERE project_id = ${projectId} AND release = ${release}
        AND file_name = ANY(${fileNames})
    `;
    if (mapRows.length === 0) return { stack, symbolicated: false };

    const traceMaps = new Map<string, TraceMap>();
    for (const row of mapRows) {
      try {
        traceMaps.set(row.file_name, new TraceMap(row.map as EncodedSourceMap));
      } catch {
        // Skip corrupt maps; other files can still symbolicate.
      }
    }

    let symbolicated = false;
    for (const { index, parsed } of frames) {
      const traceMap = traceMaps.get(baseName(parsed.file));
      if (!traceMap) continue;
      const position = originalPositionFor(traceMap, {
        line: parsed.line,
        column: Math.max(parsed.column - 1, 0),
      });
      if (!position.source || position.line === null) continue;
      const location = `${position.source}:${position.line}:${(position.column ?? 0) + 1}`;
      const fn = position.name ?? parsed.functionName;
      lines[index] =
        parsed.style === "v8"
          ? fn
            ? `${parsed.indent}at ${fn} (${location})`
            : `${parsed.indent}at ${location}`
          : `${parsed.indent}${fn ?? ""}@${location}`;
      symbolicated = true;
    }
    return { stack: lines.join("\n"), symbolicated };
  } catch {
    return { stack, symbolicated: false };
  }
}
