"use client";

import { LogOut } from "lucide-react";
import { useState, type FormEvent } from "react";

export function LogoutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSigningOut) return;

    const form = event.currentTarget;
    setIsSigningOut(true);

    try {
      const response = await fetch(form.action, { method: "POST" });
      if (!response.ok) throw new Error(`Sign out failed with status ${response.status}`);
      window.location.replace("/login");
    } catch {
      form.submit();
    }
  }

  return (
    <form action="/api/auth/logout" method="post" onSubmit={signOut}>
      <button className="button" type="submit" disabled={isSigningOut}>
        <LogOut aria-hidden="true" size={17} />
        {isSigningOut ? "Signing out" : "Sign out"}
      </button>
    </form>
  );
}
