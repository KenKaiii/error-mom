"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";

export function LoginForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: data.get("token") }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Sign in failed. Try again.");
        return;
      }
      window.location.assign("/");
    } catch {
      setError("Error Mom could not reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="login-form"
      onSubmit={submit}
      aria-describedby={error ? "login-error" : undefined}
    >
      <label htmlFor="admin-token">Admin token</label>
      <input
        id="admin-token"
        name="token"
        type="password"
        autoComplete="current-password"
        required
        minLength={32}
        placeholder="Paste ERROR_MOM_ADMIN_TOKEN"
      />
      {error ? (
        <p className="form-error" id="login-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="button button-primary" type="submit" disabled={pending}>
        {pending ? "Checking token" : "Open incident desk"}
        <ArrowRight aria-hidden="true" size={18} />
      </button>
    </form>
  );
}
