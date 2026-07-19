import { Radio } from "lucide-react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

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
      <LogoutButton />
    </header>
  );
}
