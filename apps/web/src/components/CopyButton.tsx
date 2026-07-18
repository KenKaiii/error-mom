"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); stay quiet.
    }
  }

  return (
    <button className="button" type="button" onClick={copy} aria-label={label}>
      {copied ? <Check aria-hidden="true" size={17} /> : <Copy aria-hidden="true" size={17} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
