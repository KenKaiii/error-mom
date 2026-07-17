import { eventBatchSchema } from "@kenkaiiii/error-mom-protocol";
import { findProjectByIngestKey, ingestEvents, reserveIngestCapacity } from "@/lib/issues";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-error-mom-key",
  "access-control-max-age": "86400",
};

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_000_000)
    return jsonError("payload_too_large", "Event batches are limited to 1 MB.", 413);

  const key = request.headers.get("x-error-mom-key") ?? "";
  if (!key) return jsonError("missing_project_key", "The x-error-mom-key header is required.", 401);

  const project = await findProjectByIngestKey(key);
  if (!project)
    return jsonError("invalid_project_key", "The project ingest key is not valid.", 401);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError("invalid_json", "The request body must be valid JSON.", 400);
  }

  const result = eventBatchSchema.safeParse(rawBody);
  if (!result.success) {
    return Response.json(
      {
        error: {
          code: "invalid_events",
          message: "The event batch did not match the Error Mom protocol.",
          fields: result.error.flatten(),
        },
      },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const capacityAvailable = await reserveIngestCapacity(project.id, result.data.events.length);
  if (!capacityAvailable) {
    return jsonError("rate_limited", "This project exceeded 2,000 events per minute.", 429, {
      "retry-after": "60",
    });
  }

  await ingestEvents(project.id, result.data.events);
  return Response.json(
    { accepted: result.data.events.length, projectId: project.id },
    { status: 202, headers: CORS_HEADERS },
  );
}

function jsonError(
  code: string,
  message: string,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { ...CORS_HEADERS, ...headers } },
  );
}
