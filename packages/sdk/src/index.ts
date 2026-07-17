import type { Breadcrumb, ErrorEvent as ErrorMomEvent } from "@kenkaiiii/error-mom-protocol";
import {
  createEvent,
  endpoint,
  MAX_BREADCRUMBS,
  printable,
  redactString,
  SDK_NAME,
  SDK_VERSION,
  type CaptureContext,
  type CommonOptions,
} from "./shared.js";

export interface BrowserOptions extends CommonOptions {
  captureFailedRequests?: boolean;
  flushIntervalMs?: number;
  maxQueueSize?: number;
}

export interface ErrorMomBrowser {
  captureError(error: unknown, context?: CaptureContext): string;
  addBreadcrumb(breadcrumb: Omit<Breadcrumb, "timestamp"> & { timestamp?: string }): void;
  flush(): Promise<void>;
  dispose(): void;
}

const clients = new Map<string, BrowserClient>();

class BrowserClient implements ErrorMomBrowser {
  private readonly options: Required<
    Pick<
      BrowserOptions,
      "captureConsoleErrors" | "captureFailedRequests" | "flushIntervalMs" | "maxQueueSize"
    >
  > &
    BrowserOptions;
  private readonly breadcrumbs: Breadcrumb[] = [];
  private queue: ErrorMomEvent[] = [];
  private flushPromise: Promise<void> | undefined;
  private readonly restore: Array<() => void> = [];
  private interval?: ReturnType<typeof setInterval>;
  private readonly storageKey: string;
  private nativeFetch?: typeof fetch;

  constructor(options: BrowserOptions) {
    this.options = {
      ...options,
      captureConsoleErrors: options.captureConsoleErrors ?? true,
      captureFailedRequests: options.captureFailedRequests ?? true,
      flushIntervalMs: options.flushIntervalMs ?? 5_000,
      maxQueueSize: options.maxQueueSize ?? 100,
    };
    this.storageKey = `error-mom:${options.projectKey.slice(-12)}`;
    this.restoreQueue();
    this.installGlobalHandlers();
    this.interval = setInterval(() => void this.flush(), this.options.flushIntervalMs);
    void this.flush();
  }

  captureError(error: unknown, context: CaptureContext = {}): string {
    const event = createEvent(error, this.options, this.breadcrumbs, "browser", context);
    this.queue.push(event);
    this.queue = this.queue.slice(-this.options.maxQueueSize);
    this.persistQueue();
    void this.flush();
    return event.eventId;
  }

  addBreadcrumb(input: Omit<Breadcrumb, "timestamp"> & { timestamp?: string }): void {
    this.breadcrumbs.push({
      ...input,
      timestamp: input.timestamp ?? new Date().toISOString(),
      message: redactString(input.message).slice(0, 2_000),
    });
    if (this.breadcrumbs.length > MAX_BREADCRUMBS) this.breadcrumbs.shift();
  }

  flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    if (this.queue.length === 0) return Promise.resolve();
    this.flushPromise = this.sendBatch().finally(() => {
      this.flushPromise = undefined;
    });
    return this.flushPromise;
  }

  private async sendBatch(): Promise<void> {
    const batch = this.queue.slice(0, 20);
    try {
      const transport = this.nativeFetch ?? fetch;
      const response = await transport(endpoint(this.options.server), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-error-mom-key": this.options.projectKey,
        },
        body: JSON.stringify({ events: batch, sdk: { name: SDK_NAME, version: SDK_VERSION } }),
        keepalive: true,
      });
      if (!response.ok) return;
      const accepted = new Set(batch.map((event) => event.eventId));
      this.queue = this.queue.filter((event) => !accepted.has(event.eventId));
      this.persistQueue();
    } catch {
      // The durable browser queue retries without affecting the host app.
    }
  }

  dispose(): void {
    if (this.interval) clearInterval(this.interval);
    for (const callback of this.restore.reverse()) callback();
    clients.delete(this.options.projectKey);
  }

  private installGlobalHandlers(): void {
    if (typeof window === "undefined") return;

    const onError = (event: globalThis.ErrorEvent) => {
      this.captureError(event.error ?? new Error(event.message), {
        level: "fatal",
        ...(event.filename ? { culprit: `${event.filename}:${event.lineno}:${event.colno}` } : {}),
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      this.captureError(event.reason, { culprit: "unhandledrejection" });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void this.flush();
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    document.addEventListener("visibilitychange", onVisibility);
    this.restore.push(() => window.removeEventListener("error", onError));
    this.restore.push(() => window.removeEventListener("unhandledrejection", onRejection));
    this.restore.push(() => document.removeEventListener("visibilitychange", onVisibility));

    this.captureConsole();
    this.captureFetchFailures();
  }

  private captureConsole(): void {
    const levels = ["debug", "info", "warn", "error"] as const;
    for (const level of levels) {
      const original = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        original(...args);
        const message = args.map(printable).join(" ").slice(0, 2_000);
        this.addBreadcrumb({
          category: "console",
          level: level === "warn" ? "warning" : level,
          message,
        });
        if (level === "error" && this.options.captureConsoleErrors) {
          this.captureError(args[0] instanceof Error ? args[0] : new Error(message), {
            culprit: "console.error",
          });
        }
      };
      this.restore.push(() => {
        console[level] = original;
      });
    }
  }

  private captureFetchFailures(): void {
    if (!this.options.captureFailedRequests || typeof fetch === "undefined") return;
    const original = fetch.bind(globalThis);
    this.nativeFetch = original;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(this.options.server)) return original(input, init);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      try {
        const response = await original(input, init);
        if (response.status >= 500) {
          this.captureError(
            new Error(`${method} ${redactString(url)} returned ${response.status}`),
            {
              culprit: "fetch",
              tags: { statusCode: String(response.status), method },
            },
          );
        }
        return response;
      } catch (error) {
        this.captureError(error, { culprit: "fetch", tags: { method, url: redactString(url) } });
        throw error;
      }
    };
    this.restore.push(() => {
      globalThis.fetch = original;
    });
  }

  private restoreQueue(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) this.queue = JSON.parse(stored) as ErrorMomEvent[];
    } catch {
      this.queue = [];
    }
  }

  private persistQueue(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.queue));
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }
}

export function initErrorMom(options: BrowserOptions): ErrorMomBrowser {
  if (!options.server || !options.projectKey) {
    throw new Error("Error Mom requires both server and projectKey");
  }
  const existing = clients.get(options.projectKey);
  if (existing) return existing;
  const client = new BrowserClient(options);
  clients.set(options.projectKey, client);
  return client;
}

export type { Breadcrumb, ErrorEvent } from "@kenkaiiii/error-mom-protocol";
export type { CaptureContext } from "./shared.js";
