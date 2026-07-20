import type { IssueStatus } from "@kenkaiiii/error-mom-protocol";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { IssueTable } from "@/components/IssueTable";
import { ProjectRail } from "@/components/ProjectRail";
import { isPageAuthenticated } from "@/lib/auth";
import { formatQuantity } from "@/lib/format";
import { listIssues, listProjects, summarizeIssues } from "@/lib/issues";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Issue queue · Error Mom",
};

const PAGE_SIZE = 10;

const VALID_STATUSES = new Set<IssueStatus | "unresolved" | "all">([
  "unresolved",
  "observed",
  "open",
  "regressed",
  "resolved",
  "all",
]);

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; project?: string; status?: string }>;
}) {
  if (!(await isPageAuthenticated())) redirect("/login");
  const query = await searchParams;
  const requestedStatus = query.status ?? "unresolved";
  const status = VALID_STATUSES.has(requestedStatus as IssueStatus | "unresolved" | "all")
    ? (requestedStatus as IssueStatus | "unresolved" | "all")
    : "unresolved";
  const filters = { ...(query.project ? { projectId: query.project } : {}), status };
  const [projects, summary] = await Promise.all([listProjects(), summarizeIssues(filters)]);
  const pageCount = Math.max(1, Math.ceil(summary.total / PAGE_SIZE));
  const requestedPage = parsePage(query.page);
  if (requestedPage > pageCount) redirect(dashboardHref(status, query.project, pageCount));
  const page = Math.min(requestedPage, pageCount);
  const issues = await listIssues({
    ...filters,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const selectedProject = projects.find((project) => project.id === query.project);

  return (
    <main className="dashboard-shell">
      <AppHeader />

      <ProjectRail
        projects={projects}
        selectedProjectId={selectedProject?.id ?? ""}
        status={status}
      />

      <section className="dashboard-main" aria-labelledby="queue-title">
        <div className="queue-header">
          <h1 id="queue-title">Issue queue</h1>
          <dl className="queue-metrics">
            <div>
              <dt>Issues</dt>
              <dd>{formatQuantity(summary.total)}</dd>
            </div>
            <div>
              <dt>Occurrences</dt>
              <dd>{formatQuantity(summary.occurrences)}</dd>
            </div>
          </dl>
        </div>

        <nav className="status-tabs" aria-label="Issue status">
          {(["unresolved", "observed", "regressed", "resolved", "all"] as const).map((item) => (
            <Link
              key={item.toString()}
              className={status === item ? "status-tab active" : "status-tab"}
              href={statusHref(item, selectedProject?.id)}
              aria-current={status === item ? "page" : undefined}
            >
              {item === "regressed" ? "Reopened" : item === "observed" ? "Observing" : item}
            </Link>
          ))}
        </nav>

        <IssueTable
          issues={issues}
          page={page}
          pageCount={pageCount}
          pageSize={PAGE_SIZE}
          total={summary.total}
          {...(page > 1 ? { previousHref: dashboardHref(status, query.project, page - 1) } : {})}
          {...(page < pageCount
            ? { nextHref: dashboardHref(status, query.project, page + 1) }
            : {})}
        />
      </section>
    </main>
  );
}

function parsePage(value?: string): number {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function statusHref(status: IssueStatus | "unresolved" | "all", projectId?: string): string {
  return dashboardHref(status, projectId, 1);
}

function dashboardHref(
  status: IssueStatus | "unresolved" | "all",
  projectId?: string,
  page = 1,
): string {
  const parameters = new URLSearchParams();
  if (projectId) parameters.set("project", projectId);
  if (status !== "unresolved") parameters.set("status", status);
  if (page > 1) parameters.set("page", page.toString());
  const query = parameters.toString();
  return query ? `/?${query}` : "/";
}
