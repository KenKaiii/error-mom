import {
  redactStringCredentials,
  type Breadcrumb,
  type ErrorEvent,
} from "@kenkaiiii/error-mom-protocol";

export const SDK_NAME = "@kenkaiiii/error-mom";
export const SDK_VERSION = "0.3.2";
export const MAX_BREADCRUMBS = 50;

const SECRET_KEY = /authorization|cookie|password|passwd|secret|token|api[-_]?key|session/i;

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

// Frameworks (Next.js, Express, Inngest, MCP servers) catch errors to return
// a 500 or schedule a retry, so they never become uncaught exceptions. wrap()
// is the universal escape hatch: report, then rethrow so framework behavior
// (retries, error responses) is unchanged.
export function wrapFunction<A extends unknown[], R>(
  capture: (error: unknown, context?: CaptureContext) => string,
  fn: (...args: A) => R,
  context?: CaptureContext,
): (...args: A) => R {
  return (...args: A): R => {
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        return result.catch((error: unknown) => {
          capture(error, context);
          throw error;
        }) as R;
      }
      return result;
    } catch (error) {
      capture(error, context);
      throw error;
    }
  };
}

export function redactString(value: string): string {
  return redactStringCredentials(value);
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
    breadcrumbs: sanitize(breadcrumbs.slice(-MAX_BREADCRUMBS)) as Breadcrumb[],
    tags: sanitize({ ...options.tags, ...captureContext.tags }) as Record<string, string>,
    context: (sanitize(captureContext.context ?? {}) as Record<string, unknown>) ?? {},
  };
}

export function endpoint(server: string): string {
  return `${server.replace(/\/$/, "")}/api/v1/events`;
}

// Known AI/LLM provider hosts. Failed requests to these are captured with a
// provider tag and a provider-specific error name so "Anthropic 500" groups
// separately from generic fetch failures — in every app, with zero config.
const AI_PROVIDERS: Array<[RegExp, string]> = [
  [/(^|\.)api\.anthropic\.com$/, "anthropic"],
  [/(^|\.)api\.openai\.com$/, "openai"],
  [/(^|\.)openai\.azure\.com$/, "azure-openai"],
  [/(^|\.)generativelanguage\.googleapis\.com$/, "google"],
  [/(^|\.)aiplatform\.googleapis\.com$/, "google-vertex"],
  [/(^|\.)bedrock(-runtime)?[.\w-]*\.amazonaws\.com$/, "aws-bedrock"],
  [/(^|\.)api\.mistral\.ai$/, "mistral"],
  [/(^|\.)api\.groq\.com$/, "groq"],
  [/(^|\.)api\.deepseek\.com$/, "deepseek"],
  [/(^|\.)api\.x\.ai$/, "xai"],
  [/(^|\.)openrouter\.ai$/, "openrouter"],
  [/(^|\.)api\.together\.(xyz|ai)$/, "together"],
  [/(^|\.)api\.fireworks\.ai$/, "fireworks"],
  [/(^|\.)api\.cohere\.(ai|com)$/, "cohere"],
  [/(^|\.)api\.perplexity\.ai$/, "perplexity"],
  [/(^|\.)api\.replicate\.com$/, "replicate"],
  [/(^|\.)api-inference\.huggingface\.co$/, "huggingface"],
  [/(^|\.)router\.huggingface\.co$/, "huggingface"],
  [/(^|\.)api\.elevenlabs\.io$/, "elevenlabs"],
  [/(^|\.)api\.moonshot\.(ai|cn)$/, "moonshot"],
  [/(^|\.)api\.kimi\.com$/, "moonshot"],
  [/(^|\.)api\.z\.ai$/, "zai"],
  [/(^|\.)open\.bigmodel\.cn$/, "zai"],
  [/(^|\.)dashscope(-intl)?\.aliyuncs\.com$/, "qwen"],
  [/(^|\.)api\.minimax(i)?\.(chat|com|io)$/, "minimax"],
  [/(^|\.)api\.lingyiwanwu\.com$/, "yi"],
  [/(^|\.)api\.stepfun\.com$/, "stepfun"],
  [/(^|\.)api\.baichuan-ai\.com$/, "baichuan"],
  [/(^|\.)api\.siliconflow\.(cn|com)$/, "siliconflow"],
  [/(^|\.)api\.cerebras\.ai$/, "cerebras"],
  [/(^|\.)api\.sambanova\.ai$/, "sambanova"],
  [/(^|\.)api\.deepinfra\.com$/, "deepinfra"],
  [/(^|\.)api\.novita\.ai$/, "novita"],
  [/(^|\.)api\.hyperbolic\.xyz$/, "hyperbolic"],
  [/(^|\.)api\.studio\.nebius\.(ai|com)$/, "nebius"],
  [/(^|\.)models\.inference\.ai\.azure\.com$/, "github-models"],
  [/(^|\.)models\.github\.ai$/, "github-models"],
  [/(^|\.)ai-gateway\.vercel\.sh$/, "vercel-ai-gateway"],
  [/(^|\.)gateway\.ai\.cloudflare\.com$/, "cloudflare-ai-gateway"],
  [/(^|\.)api\.voyageai\.com$/, "voyage"],
  [/(^|\.)api\.jina\.ai$/, "jina"],
  [/(^|\.)api\.stability\.ai$/, "stability"],
  [/(^|\.)(queue\.)?fal\.run$/, "fal"],
  [/(^|\.)api\.assemblyai\.com$/, "assemblyai"],
  [/(^|\.)api\.deepgram\.com$/, "deepgram"],
  [/(^|\.)api\.lumalabs\.ai$/, "luma"],
  [/(^|\.)api\.dev\.runwayml\.com$/, "runway"],
];

export function providerForUrl(url: string): string | undefined {
  try {
    const hostname = new URL(url).hostname;
    for (const [pattern, provider] of AI_PROVIDERS) {
      if (pattern.test(hostname)) return provider;
    }
  } catch {
    // Relative or malformed URLs cannot belong to a known provider.
  }
  return undefined;
}

export interface FailedRequestCapture {
  error: Error;
  context: CaptureContext;
}

// Shared policy for both runtimes: server errors (>=500) always matter;
// for known AI providers auth/rate-limit/request failures (4xx) matter too.
export function describeFailedRequest(
  method: string,
  url: string,
  status: number,
): FailedRequestCapture | undefined {
  const provider = providerForUrl(url);
  const relevant = status >= 500 || (provider !== undefined && status >= 400);
  if (!relevant) return undefined;
  const cleanUrl = redactString(url);
  const error = new Error(`${method} ${cleanUrl} returned ${status}`);
  if (provider) {
    const label = provider.charAt(0).toUpperCase() + provider.slice(1);
    error.name = `${label.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())}ApiError`;
  }
  return {
    error,
    context: {
      culprit: "fetch",
      tags: {
        statusCode: String(status),
        method,
        ...(provider ? { provider } : {}),
      },
    },
  };
}
