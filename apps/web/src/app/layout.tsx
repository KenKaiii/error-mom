import type { Metadata } from "next";
import "@sakun/system.css/dist/system.css";
import "./globals.css";
import "./system-theme.css";
import { SystemSounds } from "@/components/SystemSounds";

export const metadata: Metadata = {
  title: {
    default: "Error Mom",
    template: "%s · Error Mom",
  },
  description: "Self-hosted error triage for developers and coding agents.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SystemSounds />
        {children}
      </body>
    </html>
  );
}
