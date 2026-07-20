import type { IssueSummary } from "@kenkaiiii/error-mom-protocol";
import { ArrowUpRight, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import Link from "next/link";
import { formatDate, formatQuantity } from "@/lib/format";
import { StatusMenu } from "./StatusMenu";

interface IssueTableProps {
  issues: IssueSummary[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  previousHref?: string;
  nextHref?: string;
}

export function IssueTable({
  issues,
  page,
  pageCount,
  pageSize,
  total,
  previousHref,
  nextHref,
}: IssueTableProps) {
  if (issues.length === 0) {
    return (
      <div className="empty-state">
        <Inbox aria-hidden="true" size={28} />
        <h2>No issues in this view</h2>
        <p>New grouped errors appear here as soon as an instrumented app reports them.</p>
      </div>
    );
  }

  const firstIssue = (page - 1) * pageSize + 1;
  const lastIssue = Math.min(firstIssue + issues.length - 1, total);

  return (
    <div className="issue-list-panel">
      <div className="issue-table-wrap">
        <table className="issue-table">
          <thead>
            <tr>
              <th scope="col">Issue</th>
              <th scope="col">Project</th>
              <th scope="col">Status</th>
              <th scope="col" className="numeric">
                Quantity
              </th>
              <th scope="col">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => (
              <tr key={issue.id.toString()} className={`issue-row issue-row-${issue.status}`}>
                <td data-label="Issue">
                  <Link className="issue-link" href={`/issues/${issue.id}`}>
                    <span>
                      <strong>{issue.title}</strong>
                      <small>
                        {issue.errorType}
                        {issue.culprit ? ` · ${issue.culprit}` : ""}
                      </small>
                    </span>
                    <ArrowUpRight aria-hidden="true" size={17} />
                  </Link>
                </td>
                <td data-label="Project">{issue.projectName}</td>
                <td data-label="Status">
                  <StatusMenu
                    issueId={issue.id}
                    status={issue.status}
                    latestRelease={issue.latestRelease}
                  />
                </td>
                <td data-label="Quantity" className="numeric mono">
                  {formatQuantity(issue.quantity)}
                </td>
                <td data-label="Last seen" className="mono table-time">
                  <time dateTime={issue.lastSeen}>{formatDate(issue.lastSeen)}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav className="pagination" aria-label="Issue pages">
        <p className="pagination-summary" aria-live="polite">
          Showing {formatQuantity(firstIssue)}–{formatQuantity(lastIssue)} of{" "}
          {formatQuantity(total)}
        </p>
        <div className="pagination-actions">
          {previousHref ? (
            <Link className="pagination-link" href={previousHref} rel="prev">
              <ChevronLeft aria-hidden="true" size={17} />
              <span className="pagination-label">Previous</span>
            </Link>
          ) : (
            <span className="pagination-link disabled" aria-disabled="true">
              <ChevronLeft aria-hidden="true" size={17} />
              <span className="pagination-label">Previous</span>
            </span>
          )}
          <span className="pagination-page">
            Page {formatQuantity(page)} of {formatQuantity(pageCount)}
          </span>
          {nextHref ? (
            <Link className="pagination-link" href={nextHref} rel="next">
              <span className="pagination-label">Next</span>
              <ChevronRight aria-hidden="true" size={17} />
            </Link>
          ) : (
            <span className="pagination-link disabled" aria-disabled="true">
              <span className="pagination-label">Next</span>
              <ChevronRight aria-hidden="true" size={17} />
            </span>
          )}
        </div>
      </nav>
    </div>
  );
}
