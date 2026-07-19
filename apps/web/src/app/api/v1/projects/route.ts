import { z } from "zod";
import type { NextRequest } from "next/server";
import { isApiAuthenticated, unauthorized } from "@/lib/auth";
import { listProjects } from "@/lib/issues";
import { createProject } from "@/lib/projects";

const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().max(64).optional(),
});

export async function GET(request: NextRequest): Promise<Response> {
  if (!(await isApiAuthenticated(request))) return unauthorized();
  return Response.json({ projects: await listProjects() });
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!(await isApiAuthenticated(request))) return unauthorized();
  const result = createProjectSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) {
    return Response.json(
      {
        error: {
          code: "invalid_project",
          message: "Enter a project name between 2 and 100 characters.",
        },
      },
      { status: 400 },
    );
  }
  try {
    const { existing, ...project } = await createProject(result.data.name, result.data.slug);
    // Existing slug: return the original project (200) instead of creating a
    // duplicate. Its ingest key is hash-only, so no key is included; callers
    // mint one via POST /api/v1/projects/:id/ingest-keys when needed.
    return Response.json({ project, existing }, { status: existing ? 200 : 201 });
  } catch (error) {
    return Response.json(
      {
        error: {
          code: "project_creation_failed",
          message: error instanceof Error ? error.message : "Project creation failed.",
        },
      },
      { status: 409 },
    );
  }
}
