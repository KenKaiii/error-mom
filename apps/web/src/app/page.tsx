import type { IssueStatus } from "@kenkaiiii/error-mom-protocol";
import { LogOut, Radio } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IssueTable } from "@/components/IssueTable";
import { ProjectCreator } from "@/components/ProjectCreator";
import { ProjectSelector } from "@/components/ProjectSelector";
import { isPageAuthenticated } from "@/lib/auth";
import { formatQuantity } from "@/lib/format";
import { listIssues, listProjects } from "@/lib/issues";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set<IssueStatus | "unresolved" | "all">([
  "unresolved",
  "open",
  "regressed",
  "resolved",
  "all",
]);

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; status?: string }>;
}) {
  if (!(await isPageAuthenticated())) redirect("/login");
  const query = await searchParams;
  const requestedStatus = query.status ?? "unresolved";
  const status = VALID_STATUSES.has(requestedStatus as IssueStatus | "unresolved" | "all")
    ? (requestedStatus as IssueStatus | "unresolved" | "all")
    : "unresolved";
  const [projects, issues] = await Promise.all([
    listProjects(),
    listIssues({ ...(query.project ? { projectId: query.project } : {}), status }),
  ]);
  const selectedProject = projects.find((project) => project.id === query.project);
  const occurrences = issues.reduce((total, issue) => total + issue.quantity, 0);

  return (
    <main className="dashboard-shell">
      <header className="app-header">
        <Link href="/" className="brand-link" aria-label="Error Mom dashboard">
          <strong>Error Mom</strong>
        </Link>
        <div className="header-state" aria-label="Collector status">
          <Radio aria-hidden="true" size={16} />
          Collector online
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="button button-quiet" type="submit">
            <LogOut aria-hidden="true" size={17} />
            Sign out
          </button>
        </form>
      </header>

      <aside className="project-rail" aria-label="Project scope">
        <ProjectSelector
          projects={projects}
          selectedProjectId={selectedProject?.id ?? ""}
          status={status}
        />
        <ProjectCreator />
      </aside>

      <section className="dashboard-main" aria-labelledby="queue-title">
        <div className="queue-header">
          <h1 id="queue-title">Issue queue</h1>
          <dl className="queue-metrics">
            <div>
              <dt>Issues</dt>
              <dd>{formatQuantity(issues.length)}</dd>
            </div>
            <div>
              <dt>Occurrences</dt>
              <dd>{formatQuantity(occurrences)}</dd>
            </div>
          </dl>
        </div>

        <nav className="status-tabs" aria-label="Issue status">
          {(["unresolved", "regressed", "resolved", "all"] as const).map((item) => (
            <Link
              key={item}
              className={status === item ? "status-tab active" : "status-tab"}
              href={statusHref(item, selectedProject?.id)}
              aria-current={status === item ? "page" : undefined}
            >
              {item === "regressed" ? "Reopened" : item}
            </Link>
          ))}
        </nav>

        <IssueTable issues={issues} />
      </section>
    </main>
  );
}

function statusHref(status: IssueStatus | "unresolved" | "all", projectId?: string): string {
  const parameters = new URLSearchParams();
  if (projectId) parameters.set("project", projectId);
  if (status !== "unresolved") parameters.set("status", status);
  const query = parameters.toString();
  return query ? `/?${query}` : "/";
}
