// Captures REAL browser stack traces for the symbolication parser corpus.
//
// Builds a minified bundle with esbuild, loads it in actual Chromium, Firefox,
// and WebKit via Playwright, throws, and records each engine's genuine
// error.stack alongside the source map. The output is committed at
// src/lib/__fixtures__/browser-stacks.json so CI tests parse real engine
// dialects without needing browsers installed.
//
// Re-run after changing the fixture source or to refresh engine dialects:
//   node scripts/capture-browser-stacks.mjs
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, firefox, webkit } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, "..", "src", "lib", "__fixtures__", "browser-stacks.json");

// Async frame + named throw + anonymous callback: the shapes engines format
// differently. Must stay in sync with the assertions in
// symbolicate.browsers.test.ts (THROW identifiers and structure).
const FIXTURE_SOURCE = `
function boomBrowserFixture() {
  throw new TypeError("browser corpus exploded");
}
async function asyncHop() {
  await Promise.resolve();
  boomBrowserFixture();
}
window.__captureStack = async () => {
  try {
    await asyncHop();
  } catch (error) {
    return error.stack || "";
  }
  return "";
};
`;

const BUNDLE_NAME = "corpus-abc123.js";

async function main() {
  const workDir = await mkdtemp(join(tmpdir(), "em-browser-corpus-"));
  const entry = join(workDir, "fixture.js");
  await writeFile(entry, FIXTURE_SOURCE);
  const bundleFile = join(workDir, BUNDLE_NAME);
  await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: "iife",
    sourcemap: true,
    outfile: bundleFile,
  });
  const bundle = await readFile(bundleFile, "utf8");
  const map = JSON.parse(await readFile(`${bundleFile}.map`, "utf8"));

  // Serve over http: file:// URLs make WebKit/Firefox report stacks
  // differently (or suppress them) compared with real deployments.
  const server = createServer((request, response) => {
    if (request.url === `/${BUNDLE_NAME}`) {
      response.setHeader("content-type", "text/javascript");
      response.end(bundle);
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end(
      `<!doctype html><html><body><script src="/${BUNDLE_NAME}"></script></body></html>`,
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  const stacks = {};
  for (const [name, engine] of [
    ["chromium", chromium],
    ["firefox", firefox],
    ["webkit", webkit],
  ]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${port}/`);
      const stack = await page.evaluate(() => window.__captureStack());
      if (!stack) throw new Error(`${name} returned an empty stack`);
      stacks[name] = stack;
      console.log(`--- ${name} ---\n${stack}\n`);
    } finally {
      await browser.close();
    }
  }

  server.close();
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(
    outFile,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), bundleName: BUNDLE_NAME, map, stacks }, null, 2)}\n`,
  );
  await rm(workDir, { recursive: true, force: true });
  console.log(`wrote ${outFile}`);
}

await main();
