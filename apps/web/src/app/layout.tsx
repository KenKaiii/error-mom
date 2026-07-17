import type { Metadata } from "next";
import "@sakun/system.css/dist/system.css";
import "./globals.css";
import "./system-theme.css";

export const metadata: Metadata = {
  title: "Error Mom",
  description: "Self-hosted error triage for developers and coding agents.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
