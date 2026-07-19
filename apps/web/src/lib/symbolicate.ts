import {
  FlattenMap,
  originalPositionFor,
  type SectionedSourceMapInput,
  type TraceMap,
} from "@jridgewell/trace-mapping";
import type { Sql, TransactionSql } from "postgres";

const MAX_FRAMES = 50;

// V8: "    at fn (https://x/app-abc.js:1:234)" or "    at https://x/app-abc.js:1:234"
// Also covers "at async fn (...)" — the async prefix is part of the captured name.
const V8_FRAME = /^(\s*)at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)(\)?)\s*$/;
// Firefox/Safari: "fn@https://x/app-abc.js:1:234" or "@https://x/app-abc.js:1:234"
const GECKO_FRAME = /^(\s*)([^@\s]*)@(.+?):(\d+):(\d+)\s*$/;

export interface ParsedFrame {
  functionName: string | null;
  file: string;
  line: number;
  column: number;
  style: "v8" | "gecko";
  indent: string;
}

export function parseFrame(rawLine: string): ParsedFrame | null {
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

export function stackFileBaseName(file: string): string {
  const withoutQuery = file.split(/[?#]/)[0] ?? file;
  const segments = withoutQuery.split(/[\\/]/);
  return segments[segments.length - 1] ?? withoutQuery;
}

/**
 * Parse arbitrary uploaded source map JSON into a TraceMap. FlattenMap accepts
 * both regular and sectioned (index) maps. Returns null instead of throwing on
 * corrupt input — one bad map must not break the others.
 */
export function buildTraceMap(map: unknown): TraceMap | null {
  try {
    return FlattenMap(map as SectionedSourceMapInput);
  } catch {
    return null;
  }
}

export interface SymbolicationResult {
  stack: string;
  symbolicated: boolean;
}

/**
 * DB-free core: rewrite stack frames whose file basename has an entry in
 * traceMaps. Unmatched or unparseable frames are left untouched. Never throws.
 */
export function symbolicateWithTraceMaps(
  traceMaps: ReadonlyMap<string, TraceMap>,
  stack: string,
): SymbolicationResult {
  try {
    const lines = stack.split("\n");
    let symbolicated = false;
    for (let index = 0; index < Math.min(lines.length, MAX_FRAMES); index += 1) {
      const parsed = parseFrame(lines[index] ?? "");
      if (!parsed) continue;
      const traceMap = traceMaps.get(stackFileBaseName(parsed.file));
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
    const fileNames = [
      ...new Set(
        stack
          .split("\n")
          .slice(0, MAX_FRAMES)
          .map((line) => parseFrame(line))
          .filter((parsed): parsed is ParsedFrame => parsed !== null)
          .map((parsed) => stackFileBaseName(parsed.file)),
      ),
    ];
    if (fileNames.length === 0) return { stack, symbolicated: false };

    const mapRows = await sql<Array<{ file_name: string; map: unknown }>>`
      SELECT file_name, map
      FROM release_sourcemaps
      WHERE project_id = ${projectId} AND release = ${release}
        AND file_name = ANY(${fileNames})
    `;
    if (mapRows.length === 0) return { stack, symbolicated: false };

    const traceMaps = new Map<string, TraceMap>();
    for (const row of mapRows) {
      const traceMap = buildTraceMap(row.map);
      if (traceMap) traceMaps.set(row.file_name, traceMap);
    }
    return symbolicateWithTraceMaps(traceMaps, stack);
  } catch {
    return { stack, symbolicated: false };
  }
}
