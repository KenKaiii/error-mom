import type { NextRequest } from "next/server";
import { isApiAuthenticated, unauthorized } from "@/lib/auth";
import { deleteProject } from "@/lib/projects";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await isApiAuthenticated(request))) return unauthorized();
  const { id } = await context.params;
  const deleted = await deleteProject(id);
  if (!deleted) {
    return Response.json(
      { error: { code: "not_found", message: "Project not found." } },
      { status: 404 },
    );
  }
  return Response.json({ deleted: true, projectId: id });
}
