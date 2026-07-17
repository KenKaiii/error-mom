import type { NextRequest } from "next/server";
import { isApiAuthenticated, unauthorized } from "@/lib/auth";
import { createProjectIngestKey } from "@/lib/projects";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isApiAuthenticated(request)) return unauthorized();
  const { id } = await context.params;
  const ingestKey = await createProjectIngestKey(id);
  if (!ingestKey) {
    return Response.json(
      { error: { code: "not_found", message: "Project not found." } },
      { status: 404 },
    );
  }
  return Response.json({ projectId: id, ingestKey }, { status: 201 });
}
