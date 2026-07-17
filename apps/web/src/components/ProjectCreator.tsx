"use client";

import { useState, type FormEvent } from "react";
import { Check, Copy, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

interface CreatedProject {
  name: string;
  ingestKey: string;
}

export function ProjectCreator() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedProject | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: form.get("name") }),
      });
      const result = (await response.json()) as {
        project?: CreatedProject;
        error?: { message?: string };
      };
      if (!response.ok || !result.project) {
        setError(result.error?.message ?? "Project creation failed.");
        return;
      }
      setCreated(result.project);
      router.refresh();
    } catch {
      setError("Error Mom could not reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function copyKey() {
    if (!created) return;
    await navigator.clipboard.writeText(created.ingestKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  if (created) {
    return (
      <section className="key-reveal" aria-live="polite">
        <div>
          <p className="section-kicker">Save this once</p>
          <h3>{created.name} is ready</h3>
          <p>The write-only ingest key cannot be shown again.</p>
        </div>
        <code>{created.ingestKey}</code>
        <button className="button button-secondary" type="button" onClick={copyKey}>
          {copied ? <Check aria-hidden="true" size={17} /> : <Copy aria-hidden="true" size={17} />}
          {copied ? "Copied" : "Copy ingest key"}
        </button>
      </section>
    );
  }

  if (!expanded) {
    return (
      <button
        className="button button-primary project-add"
        type="button"
        onClick={() => setExpanded(true)}
      >
        <Plus aria-hidden="true" size={17} />
        New project
      </button>
    );
  }

  return (
    <form className="project-form" onSubmit={submit}>
      <label htmlFor="project-name">Project name</label>
      <input id="project-name" name="name" required minLength={2} maxLength={100} autoFocus />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="button-row">
        <button className="button button-primary" type="submit" disabled={pending}>
          {pending ? "Creating" : "Create project"}
        </button>
        <button className="button button-quiet" type="button" onClick={() => setExpanded(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
