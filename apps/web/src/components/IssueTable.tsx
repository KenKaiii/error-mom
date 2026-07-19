import type { IssueSummary } from "@kenkaiiii/error-mom-protocol";
import { ArrowUpRight, Inbox } from "lucide-react";
import Link from "next/link";
import { formatDate, formatQuantity } from "@/lib/format";
import { StatusMenu } from "./StatusMenu";

export function IssueTable({ issues }: { issues: IssueSummary[] }) {
  if (issues.length === 0) {
    return (
      <div className="empty-state">
        <Inbox aria-hidden="true" size={28} />
        <h2>No issues in this view</h2>
        <p>New grouped errors appear here as soon as an instrumented app reports them.</p>
      </div>
    );
  }

  return (
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
            <tr key={issue.id} className={`issue-row issue-row-${issue.status}`}>
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
  );
}
