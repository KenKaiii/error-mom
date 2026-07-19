import { z } from "zod";
import type { NextRequest } from "next/server";
import { isApiAuthenticated, unauthorized } from "@/lib/auth";
import { getIssue, resolveIssue } from "@/lib/issues";

const updateSchema = z.object({
  status: z.literal("resolved"),
  fixedInRelease: z.string().trim().min(1).max(500),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await isApiAuthenticated(request))) return unauthorized();
  const { id } = await context.params;
  const requestedSamples = Number(request.nextUrl.searchParams.get("samples") ?? 1);
  const sampleLimit = Number.isFinite(requestedSamples) ? requestedSamples : 1;
  const issue = await getIssue(id, sampleLimit);
  if (!issue) {
    return Response.json(
      { error: { code: "not_found", message: "Issue not found." } },
      { status: 404 },
    );
  }
  return Response.json({ issue });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await isApiAuthenticated(request))) return unauthorized();
  const result = updateSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) {
    return Response.json(
      {
        error: {
          code: "invalid_update",
          message: "fixedInRelease is required when resolving an issue.",
        },
      },
      { status: 400 },
    );
  }
  const { id } = await context.params;
  const updated = await resolveIssue(id, result.data.fixedInRelease);
  if (!updated) {
    return Response.json(
      { error: { code: "not_found", message: "Issue not found." } },
      { status: 404 },
    );
  }
  return Response.json({
    issueId: id,
    status: "resolved",
    fixedInRelease: result.data.fixedInRelease,
  });
}
