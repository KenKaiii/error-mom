import { z } from "zod";
import type { NextRequest } from "next/server";
import { isApiAuthenticated, unauthorized } from "@/lib/auth";
import { MAX_MAP_BYTES, storeSourceMap } from "@/lib/sourcemaps";

const uploadSchema = z.object({
  projectId: z.string().trim().min(1).max(200),
  release: z.string().trim().min(1).max(200),
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine((name) => !/[\\/]/.test(name), "fileName must be a basename without path separators"),
  map: z.object({ version: z.number(), mappings: z.string() }).loose(),
});

export async function POST(request: NextRequest): Promise<Response> {
  // Source map upload is an admin-token operation. Ingest keys ship inside
  // public browser bundles and must never be able to write source maps.
  if (!(await isApiAuthenticated(request))) return unauthorized();

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_MAP_BYTES + 64 * 1024) {
    return jsonError("map_too_large", "Source maps are limited to 20 MB.", 413);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError("invalid_json", "The request body must be valid JSON.", 400);
  }

  const result = uploadSchema.safeParse(rawBody);
  if (!result.success) {
    return Response.json(
      {
        error: {
          code: "invalid_sourcemap",
          message: "Provide projectId, release, fileName, and a source map object.",
          fields: result.error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  if (JSON.stringify(result.data.map).length > MAX_MAP_BYTES) {
    return jsonError("map_too_large", "Source maps are limited to 20 MB.", 413);
  }

  const stored = await storeSourceMap(result.data);
  if (!stored.ok) return jsonError(stored.code, stored.message, stored.status);
  return Response.json({ stored: true }, { status: 201 });
}

function jsonError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}
