"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check, Copy, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface CreatedProject {
  name: string;
  ingestKey: string;
}

export function ProjectCreator() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedProject | null>(null);
  const [copied, setCopied] = useState(false);

  function openDialog() {
    setError("");
    setCreated(null);
    setCopied(false);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
    setCreated(null);
  }

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

  return (
    <>
      <button className="button project-add" type="button" onClick={openDialog}>
        <Plus aria-hidden="true" size={17} />
        New project
      </button>
      <dialog ref={dialogRef} className="project-dialog" aria-labelledby="project-dialog-title">
        <header className="project-dialog-header">
          <h2 id="project-dialog-title">{created ? `${created.name} is ready` : "New project"}</h2>
          <button className="icon-button" type="button" onClick={closeDialog} aria-label="Close">
            <X aria-hidden="true" size={19} />
          </button>
        </header>

        {created ? (
          <section className="key-reveal" aria-live="polite">
            <p>Copy this write-only ingest key now. It will not be shown again.</p>
            <code>{created.ingestKey}</code>
            <div className="button-row">
              <button className="button" type="button" onClick={copyKey}>
                {copied ? (
                  <Check aria-hidden="true" size={17} />
                ) : (
                  <Copy aria-hidden="true" size={17} />
                )}
                {copied ? "Copied" : "Copy ingest key"}
              </button>
              <button className="button" type="button" onClick={closeDialog}>
                Done
              </button>
            </div>
          </section>
        ) : (
          <form className="project-form" onSubmit={submit}>
            <label htmlFor="project-name">Project name</label>
            <input id="project-name" name="name" required minLength={2} maxLength={100} autoFocus />
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="button-row">
              <button className="button" type="button" onClick={closeDialog}>
                Cancel
              </button>
              <button className="button" type="submit" disabled={pending}>
                {pending ? "Creating" : "Create project"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
