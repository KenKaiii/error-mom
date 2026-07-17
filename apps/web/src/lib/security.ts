import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const SECRET_KEY = /authorization|cookie|password|passwd|secret|token|api[-_]?key|session/i;
const URL_SECRET = /([?&](?:token|key|secret|password|code)=)[^&\s]*/gi;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createIdentifier(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}

export function createIngestKey(): string {
  return `em_ingest_${randomBytes(32).toString("base64url")}`;
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftHash = Buffer.from(sha256(left), "hex");
  const rightHash = Buffer.from(sha256(right), "hex");
  return timingSafeEqual(leftHash, rightHash);
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (typeof value === "string") {
    return value
      .replace(URL_SECRET, "$1[REDACTED]")
      .replace(EMAIL, "[REDACTED_EMAIL]")
      .slice(0, 100_000);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redact(item, depth + 1));
  if (typeof value === "object" && value) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 200)
        .map(([key, item]) => [key, SECRET_KEY.test(key) ? "[REDACTED]" : redact(item, depth + 1)]),
    );
  }
  return String(value).slice(0, 2_000);
}
