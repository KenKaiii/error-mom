import { LogOut, Radio } from "lucide-react";
import Link from "next/link";

export function AppHeader() {
  return (
    <header className="app-header">
      <Link href="/" className="brand-link" aria-label="Error Mom dashboard">
        <strong>Error Mom</strong>
      </Link>
      <div className="header-state" aria-label="Collector status">
        <Radio aria-hidden="true" size={16} />
        Collector online
      </div>
      <form action="/api/auth/logout" method="post">
        <button className="button" type="submit">
          <LogOut aria-hidden="true" size={17} />
          Sign out
        </button>
      </form>
    </header>
  );
}
