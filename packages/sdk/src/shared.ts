import type { Breadcrumb, ErrorEvent } from "@kenkaiiii/error-mom-protocol";

export const SDK_NAME = "@kenkaiiii/error-mom";
export const SDK_VERSION = "0.1.0";
export const MAX_BREADCRUMBS = 50;

const SECRET_KEY = /authorization|cookie|password|passwd|secret|token|api[-_]?key|session/i;
const URL_CREDENTIAL = /([?&](?:token|key|secret|password|code)=)[^&\s]*/gi;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export interface CommonOptions {
  server: string;
  projectKey: string;
  environment?: string;
  release?: string;
  installationId?: string;
  tags?: Record<string, string>;
  captureConsoleErrors?: boolean;
}

export interface CaptureContext {
  level?: ErrorEvent["level"];
  culprit?: string;
  tags?: Record<string, string>;
  context?: Record<string, unknown>;
}

export function redactString(value: string): string {
  return value.replace(URL_CREDENTIAL, "$1[REDACTED]").replace(EMAIL, "[REDACTED_EMAIL]");
}

export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED]";
  if (typeof value === "string") return redactString(value).slice(0, 10_000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));
  if (typeof value === "object" && value) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([key, item]) => [
          key,
          SECRET_KEY.test(key) ? "[REDACTED]" : sanitize(item, depth + 1),
        ]),
    );
  }
  return String(value).slice(0, 2_000);
}

export function printable(value: unknown): string {
  if (typeof value === "string") return redactString(value);
  try {
    return JSON.stringify(sanitize(value));
  } catch {
    return String(value);
  }
}

export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);
  return new Error(printable(value));
}

export function platformName(): string {
  if (typeof navigator !== "undefined") return navigator.platform || "browser";
  return typeof process !== "undefined" ? process.platform : "unknown";
}

export function createEvent(
  value: unknown,
  options: CommonOptions,
  breadcrumbs: Breadcrumb[],
  runtime: string,
  captureContext: CaptureContext = {},
): ErrorEvent {
  const error = toError(value);
  const now = new Date().toISOString();
  return {
    eventId: crypto.randomUUID(),
    timestamp: now,
    level: captureContext.level ?? "error",
    error: {
      name: redactString(error.name || "Error").slice(0, 500),
      message: redactString(error.message || "Unknown error").slice(0, 10_000),
      ...(error.stack ? { stack: redactString(error.stack).slice(0, 100_000) } : {}),
    },
    environment: options.environment ?? "production",
    ...(options.release ? { release: options.release } : {}),
    platform: platformName(),
    runtime,
    ...(typeof location !== "undefined" ? { url: redactString(location.href) } : {}),
    ...(captureContext.culprit ? { culprit: redactString(captureContext.culprit) } : {}),
    ...(options.installationId ? { installationId: options.installationId } : {}),
    breadcrumbs: breadcrumbs.slice(-MAX_BREADCRUMBS),
    tags: { ...options.tags, ...captureContext.tags },
    context: (sanitize(captureContext.context ?? {}) as Record<string, unknown>) ?? {},
  };
}

export function endpoint(server: string): string {
  return `${server.replace(/\/$/, "")}/api/v1/events`;
}
