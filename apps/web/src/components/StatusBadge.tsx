import type { IssueStatus } from "@kenkaiiii/error-mom-protocol";
import { CircleCheck, CircleDot, RotateCcw } from "lucide-react";

export function StatusBadge({ status }: { status: IssueStatus }) {
  const Icon = status === "resolved" ? CircleCheck : status === "regressed" ? RotateCcw : CircleDot;
  const label = status === "regressed" ? "Reopened" : status === "resolved" ? "Resolved" : "Open";
  return (
    <span className={`status status-${status}`}>
      <Icon aria-hidden="true" size={14} />
      {label}
    </span>
  );
}
