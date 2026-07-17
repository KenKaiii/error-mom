"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function ResolveIssueForm({
  issueId,
  suggestedRelease,
}: {
  issueId: string;
  suggestedRelease: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/v1/issues/${issueId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "resolved", fixedInRelease: data.get("release") }),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setError(result.error?.message ?? "Issue resolution failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Error Mom could not reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="resolve-form" onSubmit={submit}>
      <div>
        <label htmlFor="fixed-release">Fixed in release</label>
        <input
          id="fixed-release"
          name="release"
          required
          maxLength={500}
          defaultValue={suggestedRelease}
          placeholder="1.4.2"
        />
      </div>
      <button className="button button-success" type="submit" disabled={pending}>
        <CheckCircle2 aria-hidden="true" size={18} />
        {pending ? "Resolving" : "Mark resolved"}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
