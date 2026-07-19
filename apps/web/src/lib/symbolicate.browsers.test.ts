import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTraceMap, parseFrame, symbolicateWithTraceMaps } from "./symbolicate";

// REAL stacks captured from actual Chromium, Firefox, and WebKit engines by
// scripts/capture-browser-stacks.mjs — not handcrafted strings. Regenerate
// with `node scripts/capture-browser-stacks.mjs` (needs Playwright browsers).
const corpus = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "browser-stacks.json"), "utf8"),
) as {
  bundleName: string;
  map: Record<string, unknown>;
  stacks: Record<string, string>;
};

const browsers = Object.keys(corpus.stacks);

function symbolicate(stack: string) {
  const traceMap = buildTraceMap(corpus.map);
  if (!traceMap) throw new Error("corpus map failed to parse");
  return symbolicateWithTraceMaps(new Map([[corpus.bundleName, traceMap]]), stack);
}

describe("real browser stack corpus", () => {
  it("covers all three engines", () => {
    expect(browsers).toEqual(expect.arrayContaining(["chromium", "firefox", "webkit"]));
  });

  it.each(browsers)("%s: bundle frames parse to the right file and position", (browser) => {
    const lines = corpus.stacks[browser]!.split("\n");
    const bundleFrames = lines.filter((line) => line.includes(corpus.bundleName));
    // Throw site + async hop + entry callback.
    expect(bundleFrames.length).toBeGreaterThanOrEqual(3);
    for (const frame of bundleFrames) {
      const parsed = parseFrame(frame);
      expect(parsed, `frame should parse: ${JSON.stringify(frame)}`).not.toBeNull();
      expect(parsed!.file).toContain(corpus.bundleName);
      expect(parsed!.line).toBeGreaterThan(0);
      expect(parsed!.column).toBeGreaterThan(0);
    }
  });

  it.each(browsers)("%s: the throw frame symbolicates to the original source", (browser) => {
    const result = symbolicate(corpus.stacks[browser]!);
    expect(result.symbolicated).toBe(true);
    // The throw inside boomBrowserFixture lives at fixture.js line 3.
    expect(result.stack).toContain("fixture.js:3:");
  });

  it.each(browsers)("%s: every bundle frame rewrites off the minified file", (browser) => {
    const result = symbolicate(corpus.stacks[browser]!);
    for (const line of result.stack.split("\n")) {
      // Frames pointing into the bundle must all have been rewritten;
      // non-bundle frames (test-harness eval noise) may remain untouched.
      expect(line, `unrewritten bundle frame: ${JSON.stringify(line)}`).not.toContain(
        corpus.bundleName,
      );
    }
  });

  it("firefox async* frames keep parsing (regression pin for the async prefix)", () => {
    const asyncFrame = corpus.stacks["firefox"]!.split("\n").find((line) =>
      line.startsWith("async*"),
    );
    expect(asyncFrame).toBeDefined();
    expect(parseFrame(asyncFrame!)).toMatchObject({ style: "gecko" });
  });

  it("webkit bare '@' frames are rejected, not crashed on", () => {
    expect(parseFrame("@")).toBeNull();
  });
});
