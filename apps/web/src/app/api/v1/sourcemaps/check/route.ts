import { z } from "zod";
import type { NextRequest } from "next/server";
import { isApiAuthenticated, unauthorized } from "@/lib/auth";
import { database, ensureSchema } from "@/lib/db";
import { buildTraceMap, symbolicateStack, symbolicateWithTraceMaps } from "@/lib/symbolicate";
import { resolveProjectId } from "@/lib/sourcemaps";

// Dry-run symbolication so agents and `error-mom doctor` can prove the
// pipeline end to end without persisting anything. Two modes:
// - inline: { stack, fileName, map } exercises the engine with a map from the
//   request body — nothing is read from or written to storage.
// - stored: { stack, projectId, release } symbolicates against previously
//   uploaded maps, answering "will my production stacks actually symbolicate?"
const inlineCheckSchema = z.object({
  stack: z.string().min(1).max(50_000),
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine((name) => !/[\\/]/.test(name), "fileName must be a basename without path separators"),
  map: z.object({ version: z.number() }).loose(),
});

const storedCheckSchema = z.object({
  stack: z.string().min(1).max(50_000),
  projectId: z.string().trim().min(1).max(200),
  release: z.string().trim().min(1).max(200),
});

export async function POST(request: NextRequest): Promise<Response> {
  if (!(await isApiAuthenticated(request))) return unauthorized();

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError("invalid_json", "The request body must be valid JSON.", 400);
  }

  const inline = inlineCheckSchema.safeParse(rawBody);
  if (inline.success) {
    const traceMap = buildTraceMap(inline.data.map);
    if (!traceMap) {
      return jsonError("invalid_map", "The provided source map could not be parsed.", 400);
    }
    const result = symbolicateWithTraceMaps(
      new Map([[inline.data.fileName, traceMap]]),
      inline.data.stack,
    );
    return Response.json({ mode: "inline", ...result });
  }

  const stored = storedCheckSchema.safeParse(rawBody);
  if (stored.success) {
    await ensureSchema();
    const sql = database();
    const projectId = await resolveProjectId(sql, stored.data.projectId);
    if (!projectId) {
      return jsonError("project_not_found", "No project matches that id or slug.", 404);
    }
    const result = await symbolicateStack(sql, projectId, stored.data.release, stored.data.stack);
    return Response.json({ mode: "stored", ...result });
  }

  return Response.json(
    {
      error: {
        code: "invalid_check",
        message:
          "Provide either { stack, fileName, map } for an inline check or { stack, projectId, release } to check stored maps.",
        fields: inline.error.flatten(),
      },
    },
    { status: 400 },
  );
}

function jsonError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}
