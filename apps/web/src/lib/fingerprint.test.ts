import { describe, expect, it } from "vitest";
import { fingerprintError, normalizeStack } from "./fingerprint";

describe("fingerprintError", () => {
  it("groups dynamic IDs, paths, and line numbers", () => {
    const first = fingerprintError(
      "TypeError",
      "Could not render user 42",
      "TypeError: Could not render user 42\n    at render (/Users/ken/app/src/render.ts:12:4)",
    );
    const second = fingerprintError(
      "TypeError",
      "Could not render user 981",
      "TypeError: Could not render user 981\n    at render (/home/user/app/src/render.ts:88:19)",
    );
    expect(first).toBe(second);
  });

  it("keeps distinct stack frames separate", () => {
    const render = fingerprintError(
      "TypeError",
      "Failed",
      "TypeError: Failed\n    at render (render.ts:12:4)",
    );
    const exportVideo = fingerprintError(
      "TypeError",
      "Failed",
      "TypeError: Failed\n    at exportVideo (export.ts:12:4)",
    );
    expect(render).not.toBe(exportVideo);
  });

  it("groups tool failures across changing orchestration stacks", () => {
    const first = fingerprintError(
      "Error",
      "Tool grep failed",
      "Error: Tool grep failed\n    at runAgent (app-sidecar.mjs:100:2)",
      "tool.grep",
    );
    const second = fingerprintError(
      "Error",
      "Tool grep failed",
      "Error: Tool grep failed\n    at driveAutopilotCycle (app-sidecar.mjs:900:8)",
      "tool.grep",
    );

    expect(first).toBe(second);
    expect(first).toBe(second);
  });

  it("can group operational failures across changing stacks", () => {
    const first = fingerprintError(
      "ProviderError",
      "Usage limit reached",
      "at fetchUsage (old-bundle.js:10:2)",
      "app-sidecar.usage.fetch",
      true,
    );
    const second = fingerprintError(
      "ProviderError",
      "Usage limit reached",
      "at subscriptionUsage (new-bundle.js:900:8)",
      "app-sidecar.usage.fetch",
      true,
    );

    expect(first).toBe(second);
  });
});

describe("normalizeStack", () => {
  it("limits fingerprint material to twelve lines", () => {
    const stack = Array.from(
      { length: 30 },
      (_, index) => `at frame${index} (file.ts:${index}:1)`,
    ).join("\n");
    expect(normalizeStack(stack).split("\n")).toHaveLength(12);
  });
});
