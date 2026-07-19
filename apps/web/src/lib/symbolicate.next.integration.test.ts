import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTraceMap, symbolicateWithTraceMaps } from "./symbolicate";

// The plan's known weak spot: Next.js maps come from `next build` itself
// (webpack://_N_E/ source paths, content-hashed chunk names), not from a
// generic webpack config. This runs a REAL `next build` with
// productionBrowserSourceMaps and proves the produced maps symbolicate a
// frame at the throw site back to the original page source.
//
// Gated with the integration tier: `next build` costs ~30-60s, so it runs
// where TEST_DATABASE_URL is set (CI, full local runs), not on quick loops.
const databaseUrl = process.env.TEST_DATABASE_URL;

const MARKER = "next fixture exploded";

// Inside apps/web so the fixture resolves next/react from our node_modules.
const fixtureDir = join(process.cwd(), ".stress-next-fixture");

async function findChunkWithMarker(dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findChunkWithMarker(fullPath);
      if (found) return found;
    } else if (entry.name.endsWith(".js")) {
      if ((await readFile(fullPath, "utf8")).includes(MARKER)) return fullPath;
    }
  }
  return null;
}

// Turbopack (Next 16) map basenames do NOT match their chunks; the
// sourceMappingURL comment is the only link — same logic the CLI uses.
async function mapFileFor(chunkPath: string): Promise<string> {
  const contents = await readFile(chunkPath, "utf8");
  const matches = [...contents.matchAll(/\/\/[#@] sourceMappingURL=([^\s'"]+)/g)];
  const reference = matches[matches.length - 1]?.[1];
  if (!reference) throw new Error(`no sourceMappingURL in ${chunkPath}`);
  const mapPath = join(chunkPath, "..", reference);
  if (!existsSync(mapPath)) throw new Error(`referenced map missing: ${mapPath}`);
  return mapPath;
}

function positionOf(content: string, needle: string): { line: number; column: number } {
  const offset = content.indexOf(needle);
  if (offset < 0) throw new Error(`marker not found`);
  const before = content.slice(0, offset);
  const line = before.split("\n").length;
  const column = offset - before.lastIndexOf("\n"); // 1-based
  return { line, column };
}

describe.runIf(Boolean(databaseUrl))("next build source maps", () => {
  let chunkFile: string;

  beforeAll(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
    await mkdir(join(fixtureDir, "pages"), { recursive: true });
    // Own package.json: stops Next walking up to apps/web's "type": "module".
    await writeFile(
      join(fixtureDir, "package.json"),
      `${JSON.stringify({ name: "stress-next-fixture", private: true })}\n`,
    );
    await writeFile(
      join(fixtureDir, "next.config.mjs"),
      "export default { productionBrowserSourceMaps: true };\n",
    );
    await writeFile(
      join(fixtureDir, "pages", "index.js"),
      `export function boomNextFixture() {
  throw new TypeError(${JSON.stringify(MARKER)});
}
export default function Home() {
  return <button onClick={() => boomNextFixture()}>boom</button>;
}
`,
    );
    execFileSync(join(process.cwd(), "node_modules", ".bin", "next"), ["build"], {
      cwd: fixtureDir,
      env: { ...process.env, NODE_OPTIONS: "", NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "pipe",
      timeout: 180_000,
    });
    const found = await findChunkWithMarker(join(fixtureDir, ".next", "static"));
    if (!found) throw new Error("no client chunk containing the fixture marker was produced");
    chunkFile = found;
  }, 240_000);

  afterAll(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  it("symbolicates a frame at the throw site back to pages/index.js", async () => {
    const chunk = await readFile(chunkFile, "utf8");
    const map = JSON.parse(await readFile(await mapFileFor(chunkFile), "utf8")) as Record<
      string,
      unknown
    >;
    const chunkName = chunkFile.split("/").pop()!;
    const { line, column } = positionOf(chunk, `"${MARKER}"`);

    // A production stack frame exactly as a browser would report it against
    // the deployed chunk URL.
    const stack = `TypeError: ${MARKER}\n    at t (https://app.example/_next/static/chunks/${chunkName}:${line}:${column})`;
    const traceMap = buildTraceMap(map);
    expect(traceMap).not.toBeNull();
    const result = symbolicateWithTraceMaps(new Map([[chunkName, traceMap!]]), stack);

    expect(result.symbolicated).toBe(true);
    // Turbopack maps use turbopack:///[project]/pages/index.js source paths.
    expect(result.stack).toContain("pages/index.js");
    expect(result.stack).not.toContain(chunkName);
  });

  it("the map declares the original page in sources", async () => {
    const map = JSON.parse(await readFile(await mapFileFor(chunkFile), "utf8")) as {
      sources: string[];
    };
    expect(map.sources.some((source) => source.includes("pages/index.js"))).toBe(true);
  });
});
