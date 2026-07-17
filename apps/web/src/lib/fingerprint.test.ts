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
