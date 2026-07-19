import type { IssueStatus } from "@kenkaiiii/error-mom-protocol";
import type { NextRequest } from "next/server";
import { isApiAuthenticated, unauthorized } from "@/lib/auth";
import { listIssues } from "@/lib/issues";

const STATUSES = new Set<IssueStatus | "unresolved" | "all">([
  "open",
  "regressed",
  "resolved",
  "unresolved",
  "all",
]);

export async function GET(request: NextRequest): Promise<Response> {
  if (!(await isApiAuthenticated(request))) return unauthorized();
  const requestedStatus = request.nextUrl.searchParams.get("status") ?? "unresolved";
  if (!STATUSES.has(requestedStatus as IssueStatus | "unresolved" | "all")) {
    return Response.json(
      {
        error: {
          code: "invalid_status",
          message: "Use open, regressed, resolved, unresolved, or all.",
        },
      },
      { status: 400 },
    );
  }
  const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;
  const issues = await listIssues({
    ...(projectId ? { projectId } : {}),
    status: requestedStatus as IssueStatus | "unresolved" | "all",
  });
  return Response.json({ issues });
}
