import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ErrorEvent } from "@kenkaiiii/error-mom-protocol";

const findProjectByIngestKey = vi.fn();
const ingestEvents = vi.fn();
const reserveIngestCapacity = vi.fn();

vi.mock("@/lib/issues", () => ({
  findProjectByIngestKey: (...args: unknown[]) => findProjectByIngestKey(...args),
  ingestEvents: (...args: unknown[]) => ingestEvents(...args),
  reserveIngestCapacity: (...args: unknown[]) => reserveIngestCapacity(...args),
}));

const { POST } = await import("./route");

function postEvents(events: ErrorEvent[]): Promise<Response> {
  return POST(
    new Request("http://localhost/api/v1/events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-error-mom-key": "em_ingest_test" },
      body: JSON.stringify({ events, sdk: { name: "route-test", version: "0.0.0" } }),
    }),
  );
}

function buildEvent(overrides: { errorName?: string; tags?: Record<string, string> }): ErrorEvent {
  return {
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level: "error",
    error: {
      name: overrides.errorName ?? "TypeError",
      message: "Synthetic setup verification",
      stack: "at test:1:1",
    },
    environment: "setup",
    release: "0.1.1",
    platform: "linux",
    runtime: "node test",
    breadcrumbs: [],
    tags: overrides.tags ?? {},
    context: {},
  };
}

describe("events route synthetic-skip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findProjectByIngestKey.mockResolvedValue({ id: "project_test" });
    reserveIngestCapacity.mockResolvedValue(true);
    ingestEvents.mockResolvedValue(undefined);
  });

  it("accepts doctor synthetic events without persisting an issue", async () => {
    const response = await postEvents([
      buildEvent({ errorName: "ErrorMomDoctor", tags: { synthetic: "true" } }),
    ]);

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      accepted: 1,
      synthetic: 1,
      projectId: "project_test",
    });
    expect(ingestEvents).not.toHaveBeenCalled();
  });

  it("persists a real error even when it carries a stray synthetic tag", async () => {
    const real = buildEvent({ errorName: "TypeError", tags: { synthetic: "true" } });
    const response = await postEvents([real]);

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ accepted: 1, synthetic: 0 });
    expect(ingestEvents).toHaveBeenCalledTimes(1);
    expect(ingestEvents).toHaveBeenCalledWith("project_test", [
      expect.objectContaining({ eventId: real.eventId }),
    ]);
  });

  it("persists only the real events from a mixed batch", async () => {
    const synthetic = buildEvent({ errorName: "ErrorMomDoctor", tags: { synthetic: "true" } });
    const real = buildEvent({ errorName: "RangeError" });
    const response = await postEvents([synthetic, real]);

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ accepted: 2, synthetic: 1 });
    const persisted = ingestEvents.mock.calls[0]?.[1] as ErrorEvent[];
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.eventId).toBe(real.eventId);
  });

  it("skips ErrorMomDoctor events missing the synthetic tag from persistence check", async () => {
    const response = await postEvents([buildEvent({ errorName: "ErrorMomDoctor", tags: {} })]);

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ accepted: 1, synthetic: 0 });
    expect(ingestEvents).toHaveBeenCalledTimes(1);
  });
});
