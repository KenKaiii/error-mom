"use client";

import type { IssueStatus } from "@kenkaiiii/error-mom-protocol";
import { CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

const STATUS_LABELS = {
  open: "Open",
  regressed: "Reopened",
  resolved: "Resolved",
} as const;

export function StatusMenu({
  issueId,
  status,
  latestRelease,
}: {
  issueId: string;
  status: IssueStatus;
  latestRelease: string | null;
}) {
  const router = useRouter();
  const releaseInputRef = useRef<HTMLInputElement>(null);
  const selectId = useId();
  const [resolving, setResolving] = useState(false);
  const [release, setRelease] = useState(latestRelease ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (resolving) releaseInputRef.current?.focus();
  }, [resolving]);

  function cancel() {
    setResolving(false);
    setError("");
  }

  async function resolve(event: React.FormEvent) {
    event.preventDefault();
    const fixedInRelease = release.trim();
    if (!fixedInRelease || pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/issues/${issueId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "resolved", fixedInRelease }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? "Resolving failed. Try again.");
        return;
      }
      setResolving(false);
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (status === "resolved") {
    return (
      <span className="status status-resolved">
        <CircleCheck aria-hidden="true" size={14} />
        {STATUS_LABELS.resolved}
      </span>
    );
  }

  return (
    <div className="status-control">
      <div className={`select-control status-select status-select-${status}`}>
        <select
          id={selectId}
          aria-label={`Status: ${STATUS_LABELS[status]}. Change status`}
          value={resolving ? "resolved" : status}
          disabled={pending}
          onChange={(event) => {
            if (event.target.value === "resolved") setResolving(true);
            else cancel();
          }}
        >
          <option value={status}>{STATUS_LABELS[status]}</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {resolving ? (
        <form className="status-resolve-form" onSubmit={resolve}>
          <label htmlFor={`${selectId}-release`}>Fixed in release</label>
          <input
            id={`${selectId}-release`}
            ref={releaseInputRef}
            value={release}
            onChange={(event) => setRelease(event.target.value)}
            maxLength={500}
            required
            placeholder="e.g. 1.4.2"
            onKeyDown={(event) => {
              if (event.key === "Escape") cancel();
            }}
          />
          {error ? (
            <p className="status-resolve-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="status-resolve-actions">
            <button type="submit" className="button" disabled={pending || !release.trim()}>
              <CircleCheck aria-hidden="true" size={16} />
              {pending ? "Resolving…" : "Resolve"}
            </button>
            <button type="button" className="button" onClick={cancel} disabled={pending}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
