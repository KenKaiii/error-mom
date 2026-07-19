import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile, appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Breadcrumb, ErrorEvent } from "@kenkaiiii/error-mom-protocol";
import {
  createEvent,
  describeFailedRequest,
  endpoint,
  MAX_BREADCRUMBS,
  printable,
  redactString,
  SDK_NAME,
  SDK_VERSION,
  type CaptureContext,
  type CommonOptions,
} from "./shared.js";

export interface NodeOptions extends CommonOptions {
  captureFailedRequests?: boolean;
  spoolDirectory?: string;
  flushIntervalMs?: number;
  maxQueueSize?: number;
}

export interface ErrorMomNode {
  captureError(error: unknown, context?: CaptureContext): string;
  addBreadcrumb(breadcrumb: Omit<Breadcrumb, "timestamp"> & { timestamp?: string }): void;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}

class NodeClient implements ErrorMomNode {
  private readonly options: Required<
    Pick<
      NodeOptions,
      "captureConsoleErrors" | "flushIntervalMs" | "maxQueueSize" | "spoolDirectory"
    >
  > &
    NodeOptions;
  private readonly breadcrumbs: Breadcrumb[] = [];
  private queue: ErrorEvent[] = [];
  private operation = Promise.resolve();
  private interval?: ReturnType<typeof setInterval>;
  private readonly spoolFile: string;
  private readonly handlers: Array<() => void> = [];
  private flushPromise: Promise<void> | undefined;
  private nativeFetch?: typeof fetch;

  constructor(options: NodeOptions) {
    this.options = {
      ...options,
      captureConsoleErrors: options.captureConsoleErrors ?? true,
      flushIntervalMs: options.flushIntervalMs ?? 5_000,
      maxQueueSize: options.maxQueueSize ?? 1_000,
      spoolDirectory: options.spoolDirectory ?? join(homedir(), ".error-mom", "spool"),
    };
    this.spoolFile = join(this.options.spoolDirectory, `${safeFilePart(options.projectKey)}.jsonl`);
    this.operation = this.restoreQueue();
    this.installProcessHandlers();
    this.captureConsole();
    this.captureFetchFailures();
    this.interval = setInterval(() => void this.flush(), this.options.flushIntervalMs);
    void this.flush();
  }

  captureError(error: unknown, context: CaptureContext = {}): string {
    const event = createEvent(
      error,
      this.options,
      this.breadcrumbs,
      `node ${process.version}`,
      context,
    );
    this.queue.push(event);
    this.queue = this.queue.slice(-this.options.maxQueueSize);
    this.operation = this.operation
      .then(async () => {
        await mkdir(this.options.spoolDirectory, { recursive: true });
        await appendFile(this.spoolFile, `${JSON.stringify(event)}\n`, { mode: 0o600 });
      })
      .catch(() => undefined);
    void this.flush();
    return event.eventId;
  }

  addBreadcrumb(input: Omit<Breadcrumb, "timestamp"> & { timestamp?: string }): void {
    this.breadcrumbs.push({ ...input, timestamp: input.timestamp ?? new Date().toISOString() });
    if (this.breadcrumbs.length > MAX_BREADCRUMBS) this.breadcrumbs.shift();
  }

  flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.sendBatch().finally(() => {
      this.flushPromise = undefined;
    });
    return this.flushPromise;
  }

  private async sendBatch(): Promise<void> {
    await this.operation;
    if (this.queue.length === 0) return;
    const batch = this.queue.slice(0, 50);
    try {
      const transport = this.nativeFetch ?? fetch;
      const response = await transport(endpoint(this.options.server), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-error-mom-key": this.options.projectKey,
        },
        body: JSON.stringify({ events: batch, sdk: { name: SDK_NAME, version: SDK_VERSION } }),
      });
      if (!response.ok) return;
      const accepted = new Set(batch.map((event) => event.eventId));
      this.queue = this.queue.filter((event) => !accepted.has(event.eventId));
      this.operation = this.operation.then(() => this.rewriteSpool());
      await this.operation;
    } catch {
      // The JSONL spool is retained for the next retry or process start.
    }
  }

  async dispose(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    for (const remove of this.handlers.reverse()) remove();
    await this.flush();
    if (singleton === this) singleton = undefined;
  }

  private installProcessHandlers(): void {
    const onUncaught = (error: Error) => {
      this.captureError(error, { level: "fatal", culprit: "uncaughtException" });
    };
    const onRejection = (reason: unknown) => {
      this.captureError(reason, { culprit: "unhandledRejection" });
    };
    process.on("uncaughtExceptionMonitor", onUncaught);
    process.on("unhandledRejection", onRejection);
    this.handlers.push(() => process.off("uncaughtExceptionMonitor", onUncaught));
    this.handlers.push(() => process.off("unhandledRejection", onRejection));
  }

  private captureFetchFailures(): void {
    if (this.options.captureFailedRequests === false || typeof fetch === "undefined") return;
    const original = fetch.bind(globalThis);
    this.nativeFetch = original;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(this.options.server)) return original(input, init);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      try {
        const response = await original(input, init);
        const failure = describeFailedRequest(method, url, response.status);
        if (failure) this.captureError(failure.error, failure.context);
        return response;
      } catch (error) {
        this.captureError(error, { culprit: "fetch", tags: { method, url: redactString(url) } });
        throw error;
      }
    }) as typeof fetch;
    this.handlers.push(() => {
      globalThis.fetch = original;
    });
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
      this.handlers.push(() => {
        console[level] = original;
      });
    }
  }

  private async restoreQueue(): Promise<void> {
    try {
      const contents = await readFile(this.spoolFile, "utf8");
      const restored = contents
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as ErrorEvent];
          } catch {
            return [];
          }
        });
      const merged = new Map(
        [...restored, ...this.queue].map((event) => [event.eventId, event] as const),
      );
      this.queue = [...merged.values()].slice(-this.options.maxQueueSize);
    } catch {
      // A missing spool is the normal first-run state; preserve events captured during startup.
    }
  }

  private async rewriteSpool(): Promise<void> {
    await mkdir(this.options.spoolDirectory, { recursive: true });
    const temporary = `${this.spoolFile}.${process.pid}.tmp`;
    const contents = this.queue.map((event) => JSON.stringify(event)).join("\n");
    await writeFile(temporary, contents ? `${contents}\n` : "", { mode: 0o600 });
    await rename(temporary, this.spoolFile);
  }
}

function safeFilePart(projectKey: string): string {
  return createHash("sha256").update(projectKey).digest("hex").slice(0, 32);
}

let singleton: NodeClient | undefined;

export function initErrorMom(options: NodeOptions): ErrorMomNode {
  if (!options.server || !options.projectKey) {
    throw new Error("Error Mom requires both server and projectKey");
  }
  singleton ??= new NodeClient(options);
  return singleton;
}

export type { Breadcrumb, ErrorEvent } from "@kenkaiiii/error-mom-protocol";
export type { CaptureContext } from "./shared.js";
