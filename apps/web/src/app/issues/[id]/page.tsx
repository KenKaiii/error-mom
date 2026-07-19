import { ArrowLeft, Box, CalendarClock, Hash, Layers3 } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { CopyButton } from "@/components/CopyButton";
import { ProjectRail } from "@/components/ProjectRail";
import { StatusMenu } from "@/components/StatusMenu";
import { isPageAuthenticated } from "@/lib/auth";
import { formatDate, formatQuantity } from "@/lib/format";
import { getIssue, listProjects } from "@/lib/issues";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isPageAuthenticated())) return { title: "Issue" };
  const { id } = await params;
  const issue = await getIssue(id);
  return { title: issue ? issue.title : "Issue not found" };
}

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isPageAuthenticated())) redirect("/login");
  const { id } = await params;
  const [issue, projects] = await Promise.all([getIssue(id), listProjects()]);
  if (!issue) notFound();
  const sample = issue.samples[0];

  return (
    <main className="dashboard-shell">
      <AppHeader />

      <ProjectRail projects={projects} selectedProjectId={issue.projectId} />

      <section className="dashboard-main" aria-label="Issue detail">
        <div className="detail-toolbar">
          <Link href={`/?project=${issue.projectId}`} className="button back-link">
            <ArrowLeft aria-hidden="true" size={18} />
            Issue queue
          </Link>
          <span className="detail-project">{issue.projectName}</span>
        </div>

        <article className="issue-detail">
          <header className={`detail-heading detail-heading-${issue.status}`}>
            <div className="detail-title-row">
              <StatusMenu
                issueId={issue.id}
                status={issue.status}
                latestRelease={issue.latestRelease}
              />
              <span className="mono fingerprint">{issue.fingerprint.slice(0, 12)}</span>
            </div>
            <h1>{issue.title}</h1>
            <p>{issue.errorType}</p>
          </header>

          <dl className="detail-facts">
            <div>
              <dt>
                <Layers3 aria-hidden="true" size={16} /> Quantity
              </dt>
              <dd>{formatQuantity(issue.quantity)}</dd>
            </div>
            <div>
              <dt>
                <CalendarClock aria-hidden="true" size={16} /> Last seen
              </dt>
              <dd>
                <time dateTime={issue.lastSeen}>{formatDate(issue.lastSeen)}</time>
              </dd>
            </div>
            <div>
              <dt>
                <Box aria-hidden="true" size={16} /> Latest release
              </dt>
              <dd>{issue.latestRelease ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>
                <Hash aria-hidden="true" size={16} /> First seen
              </dt>
              <dd>
                <time dateTime={issue.firstSeen}>{formatDate(issue.firstSeen)}</time>
              </dd>
            </div>
          </dl>

          {issue.status === "resolved" ? (
            <section className="resolved-panel">
              <h2>Resolved in {issue.fixedInRelease}</h2>
              <p>This issue stays in history so Error Mom can reopen it if the error returns.</p>
            </section>
          ) : null}

          <div className="detail-grid">
            <section className="evidence-panel" aria-labelledby="stack-title">
              <div className="panel-heading">
                <h2 id="stack-title">Stack trace</h2>
                {sample?.stack ? <CopyButton text={sample.stack} label="Copy stack trace" /> : null}
              </div>
              {sample?.stack ? (
                <pre>{sample.stack}</pre>
              ) : (
                <p className="panel-empty">No stack trace was supplied.</p>
              )}
            </section>

            <aside className="sample-sidebar" aria-label="Sample context">
              <section>
                <h2>Runtime</h2>
                <dl className="sample-list">
                  <div>
                    <dt>Environment</dt>
                    <dd>{sample?.environment ?? "Unknown"}</dd>
                  </div>
                  <div>
                    <dt>Platform</dt>
                    <dd>{sample?.platform ?? "Unknown"}</dd>
                  </div>
                  <div>
                    <dt>Runtime</dt>
                    <dd>{sample?.runtime ?? "Unknown"}</dd>
                  </div>
                  <div>
                    <dt>Release</dt>
                    <dd>{sample?.release ?? "Unknown"}</dd>
                  </div>
                </dl>
              </section>
              <section>
                <h2>Release spread</h2>
                <ul className="release-list">
                  {issue.releases.map((release) => (
                    <li key={release.release}>
                      <code>{release.release}</code>
                      <strong>{formatQuantity(release.quantity)}</strong>
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
          </div>

          <section className="breadcrumbs-panel" aria-labelledby="breadcrumbs-title">
            <div className="panel-heading">
              <h2 id="breadcrumbs-title">Breadcrumbs</h2>
              <span>{sample?.breadcrumbs.length ?? 0} captured</span>
            </div>
            {sample?.breadcrumbs.length ? (
              <ol className="breadcrumb-list">
                {sample.breadcrumbs.map((breadcrumb, index) => (
                  <li key={`${breadcrumb.timestamp}-${index}`}>
                    <time dateTime={breadcrumb.timestamp}>{formatDate(breadcrumb.timestamp)}</time>
                    <span className={`breadcrumb-level breadcrumb-${breadcrumb.level}`}>
                      {breadcrumb.level}
                    </span>
                    <strong>{breadcrumb.category}</strong>
                    <p>{breadcrumb.message}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="panel-empty">No breadcrumbs were captured for this sample.</p>
            )}
          </section>
        </article>
      </section>
    </main>
  );
}
