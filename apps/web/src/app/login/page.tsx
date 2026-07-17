import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { isPageAuthenticated } from "@/lib/auth";

export default async function LoginPage() {
  if (await isPageAuthenticated()) redirect("/");

  return (
    <main className="login-shell">
      <section className="login-intro" aria-labelledby="login-title">
        <h1 id="login-title">
          Every error,
          <br />
          <span>agent-ready.</span>
        </h1>
      </section>
      <section className="login-panel" aria-label="Sign in">
        <h2>Enter your admin token</h2>
        <LoginForm />
      </section>
    </main>
  );
}
