import type { ErrorEvent } from "@kenkaiiii/error-mom-protocol";
import { describe, expect, it } from "vitest";
import { classifyEvent } from "./triage";

function event(overrides: Partial<ErrorEvent> & { message: string }): ErrorEvent {
  return {
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level: "error",
    error: { name: "Error", message: overrides.message },
    environment: "test",
    platform: "linux",
    runtime: "node test",
    breadcrumbs: [],
    tags: {},
    context: {},
    ...overrides,
  };
}

describe("classifyEvent", () => {
  it("observes quota, subscription timeout, and polling failures", () => {
    expect(
      classifyEvent(event({ message: "Claude usage limit reached", tags: { status: "429" } })),
    ).toMatchObject({ classification: "operational", initialStatus: "observed", reason: "quota" });
    expect(
      classifyEvent(
        event({
          message: "The operation was aborted due to timeout",
          error: {
            name: "SubscriptionUsageError",
            message: "The operation was aborted due to timeout",
          },
        }),
      ),
    ).toMatchObject({ classification: "operational", reason: "transient" });
    expect(
      classifyEvent(
        event({
          message: "fetch failed",
          error: { name: "SubscriptionUsageError", message: "fetch failed" },
        }),
      ),
    ).toMatchObject({ classification: "operational", reason: "transient" });
    expect(classifyEvent(event({ message: "[telegram] Poll error: fetch failed" }))).toMatchObject({
      classification: "operational",
      reason: "transient",
    });
    expect(
      classifyEvent(
        event({
          message: "usage limit reached: Insufficient account balance",
          tags: { status: "402", provider: "xiaomi" },
        }),
      ),
    ).toMatchObject({ classification: "operational", reason: "quota" });
  });

  it("keeps provider requests actionable and observes low-volume tool failures", () => {
    expect(
      classifyEvent(event({ message: "Bad Request", tags: { provider: "openai", status: "400" } })),
    ).toMatchObject({ classification: "actionable", reason: "provider_request", retryable: false });
    expect(classifyEvent(event({ message: "Tool ls failed", culprit: "tool.ls" }))).toMatchObject({
      classification: "operational",
      initialStatus: "observed",
      reason: "tool_failure",
    });
  });
});
