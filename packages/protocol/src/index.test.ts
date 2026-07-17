import { describe, expect, it } from "vitest";
import { eventBatchSchema } from "./index";

const validEvent = {
  eventId: "2f0e7d9e-c16c-4a9c-ae1a-01d9a110a2cf",
  timestamp: "2026-07-18T12:00:00.000Z",
  level: "error",
  error: { name: "TypeError", message: "Render failed" },
  environment: "production",
  platform: "macOS",
  runtime: "browser",
  breadcrumbs: [],
  tags: {},
  context: {},
};

describe("eventBatchSchema", () => {
  it("accepts a bounded valid event batch", () => {
    expect(
      eventBatchSchema.safeParse({ events: [validEvent], sdk: { name: "test", version: "1.0.0" } })
        .success,
    ).toBe(true);
  });

  it("rejects oversized batches", () => {
    expect(
      eventBatchSchema.safeParse({
        events: Array.from({ length: 101 }, () => validEvent),
        sdk: { name: "test", version: "1.0.0" },
      }).success,
    ).toBe(false);
  });
});
