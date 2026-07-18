import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { isPageAuthenticated } from "@/lib/auth";

export default async function LoginPage() {
  if (await isPageAuthenticated()) redirect("/");

  return (
    <main className="login-shell">
      <section className="login-intro" aria-labelledby="login-title">
        <p className="login-brand">Error Mom</p>
        <h1 id="login-title">
          Every error,
          <br />
          <span>agent-ready.</span>
        </h1>
      </section>
      <section className="login-panel" aria-label="Sign in">
        <header className="project-dialog-header">
          <h2>Login</h2>
        </header>
        <div className="login-panel-body">
          <p className="login-panel-lead">Enter your admin token</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
