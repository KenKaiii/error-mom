import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ErrorEvent } from "@kenkaiiii/error-mom-protocol";

const databaseUrl = process.env.TEST_DATABASE_URL;

// The same deliberate error compiled through every bundler users actually
// ship with. Each case must symbolicate back to entry.js at the throw line,
// and two differently-minified builds of the same source must land in ONE
// issue — that grouping is the core promise of ingest-time symbolication.
const THROW_LINE = 6;
const ENTRY_SOURCE = `// stress fixture — the throw below must map back to this file
function boomStress() {
  // padding so the throw is not on line 1
  // more padding
  // eslint-disable-next-line no-constant-condition
  throw new TypeError("stress fixture exploded");
}
export function trigger() {
  boomStress();
}
`;

interface BuiltBundle {
  bundleFile: string;
  mapFileName: string;
  map: Record<string, unknown>;
}

// Run the bundle in a clean child process: vitest's own worker enables Node
// source maps, which would hand us pre-symbolicated stacks and make the test
// vacuous. A plain `node` child produces genuine minified frames.
async function captureStack(bundleFile: string): Promise<string> {
  const script = `
    const m = await import(${JSON.stringify(pathToFileURL(bundleFile).href)});
    try { m.trigger(); } catch (e) { console.log(JSON.stringify(e.stack)); }
  `;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  const stack = JSON.parse(output.toString()) as string;
  if (!stack.includes("at ")) throw new Error(`bundle ${bundleFile} did not throw with a stack`);
  return stack;
}

async function readMap(bundleFile: string): Promise<BuiltBundle> {
  const mapFile = `${bundleFile}.map`;
  return {
    bundleFile,
    mapFileName: bundleFile.split("/").pop()!,
    map: JSON.parse(await readFile(mapFile, "utf8")) as Record<string, unknown>,
  };
}

describe.runIf(Boolean(databaseUrl))("bundler matrix symbolication", () => {
  let workDir: string;
  let entryFile: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    const { ensureSchema } = await import("./db");
    await ensureSchema();
    workDir = await mkdtemp(join(tmpdir(), "em-bundlers-"));
    entryFile = join(workDir, "entry.js");
    await writeFile(entryFile, ENTRY_SOURCE);
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
    const { database } = await import("./db");
    await database().end();
  });

  async function buildEsbuild(outName: string, minify: boolean): Promise<BuiltBundle> {
    const esbuild = await import("esbuild");
    const outfile = join(workDir, outName);
    await esbuild.build({
      entryPoints: [entryFile],
      bundle: true,
      minify,
      format: "esm",
      sourcemap: true,
      outfile,
    });
    return readMap(outfile);
  }

  async function buildRollup(outName: string): Promise<BuiltBundle> {
    const { rollup } = await import("rollup");
    const bundle = await rollup({ input: entryFile });
    const outfile = join(workDir, outName);
    await bundle.write({ file: outfile, format: "esm", sourcemap: true, compact: true });
    await bundle.close();
    return readMap(outfile);
  }

  async function buildVite(outName: string): Promise<BuiltBundle> {
    const { build } = await import("vite");
    const outDir = join(workDir, `vite-${outName}`);
    await build({
      logLevel: "silent",
      configFile: false,
      build: {
        lib: { entry: entryFile, formats: ["es"], fileName: () => outName },
        outDir,
        sourcemap: true,
        minify: "esbuild",
      },
    });
    return readMap(join(outDir, outName));
  }

  async function buildWebpack(outName: string): Promise<BuiltBundle> {
    const { default: webpack } = await import("webpack");
    const outDir = join(workDir, `webpack-${outName}`);
    await new Promise<void>((resolve, reject) => {
      webpack(
        {
          entry: entryFile,
          mode: "production", // production mode minifies with terser
          devtool: "source-map",
          output: {
            path: outDir,
            filename: outName,
            library: { type: "module" },
          },
          experiments: { outputModule: true },
        },
        (error, stats) => {
          if (error) return reject(error);
          if (stats?.hasErrors()) return reject(new Error(stats.toString()));
          resolve();
        },
      );
    });
    return readMap(join(outDir, outName));
  }

  async function ingestBundleError(
    projectSlug: string,
    release: string,
    built: BuiltBundle,
    eventId: string,
  ): Promise<{ projectId: string; stack: string }> {
    const { storeSourceMap } = await import("./sourcemaps");
    const { ingestEvents } = await import("./issues");
    const stored = await storeSourceMap({
      projectId: projectSlug,
      release,
      fileName: built.mapFileName,
      map: built.map,
    });
    expect(stored).toEqual({ ok: true });

    const stack = await captureStack(built.bundleFile);
    const event: ErrorEvent = {
      eventId,
      timestamp: new Date().toISOString(),
      level: "error",
      error: { name: "TypeError", message: "stress fixture exploded", stack },
      environment: "stress",
      release,
      platform: "browser",
      runtime: "test",
      breadcrumbs: [],
      tags: {},
      context: {},
    };
    const { database } = await import("./db");
    const rows = await database()<Array<{ id: string }>>`
      SELECT id FROM projects WHERE slug = ${projectSlug}
    `;
    await ingestEvents(rows[0]!.id, [event]);
    return { projectId: rows[0]!.id, stack };
  }

  const cases: Array<[name: string, build: (outName: string) => Promise<BuiltBundle>]> = [
    ["esbuild (minified)", (out) => buildEsbuild(out, true)],
    ["rollup (compact)", (out) => buildRollup(out)],
    ["vite (lib, esbuild-minified)", (out) => buildVite(out)],
    ["webpack (production, terser)", (out) => buildWebpack(out)],
  ];

  it.each(cases)(
    "%s: minified stack symbolicates to entry.js at the throw line",
    async (name, build) => {
      const { createProject } = await import("./projects");
      const { getIssue, listIssues } = await import("./issues");
      const slug = `stress-${name.replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}`;
      const project = await createProject(`Stress ${name}`, slug);

      const built = await build(`${project.slug}.js`);
      await ingestBundleError(project.slug, "1.0.0", built, crypto.randomUUID());

      const issues = await listIssues({ projectId: project.id });
      expect(issues).toHaveLength(1);
      const detail = await getIssue(issues[0]!.id);
      const stack = detail?.samples[0]?.stack ?? "";
      expect(stack).toContain("entry.js");
      expect(stack).toContain(`entry.js:${THROW_LINE}:`);
      // The raw minified stack must be preserved for debugging.
      expect(String(detail?.samples[0]?.context["rawStack"] ?? "")).toContain(project.slug);
    },
    30_000,
  );

  it("groups the same bug across two builds with different content-hash names into one issue", async () => {
    const { createProject } = await import("./projects");
    const { listIssues } = await import("./issues");
    const project = await createProject("Stress Grouping", "stress-grouping");

    // The everyday CI scenario: identical source rebuilt per release, output
    // renamed by content hash. Raw stacks differ (different basenames), so
    // without symbolication these would split into two issues.
    const buildA = await buildEsbuild("grouping-Ab12Cd.js", true);
    const buildB = await buildEsbuild("grouping-Xy34Zw.js", true);
    const first = await ingestBundleError(project.slug, "1.0.0", buildA, crypto.randomUUID());
    const second = await ingestBundleError(project.slug, "1.0.1", buildB, crypto.randomUUID());
    expect(first.stack).not.toBe(second.stack);

    const issues = await listIssues({ projectId: project.id });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.quantity).toBe(2);
  }, 30_000);

  it("documents the name-resolution limit: different minify settings may split issues", async () => {
    // Source map `names` are sparse at throw sites, so a minified build can
    // resolve a frame to its minified name while an unminified build shows
    // the original. Grouping across minify-setting changes is therefore NOT
    // guaranteed — this test pins that boundary so a future fix is visible.
    const minified = await buildEsbuild("limit-min.js", true);
    const readable = await buildEsbuild("limit-plain.js", false);
    const { buildTraceMap, symbolicateWithTraceMaps } = await import("./symbolicate");
    const stacks = await Promise.all(
      [minified, readable].map(async (built) => {
        const stack = await captureStack(built.bundleFile);
        return symbolicateWithTraceMaps(
          new Map([[built.mapFileName, buildTraceMap(built.map)!]]),
          stack,
        );
      }),
    );
    expect(stacks[0]!.symbolicated).toBe(true);
    expect(stacks[1]!.symbolicated).toBe(true);
    // Both resolve file:line correctly even when names diverge.
    expect(stacks[0]!.stack).toContain(`entry.js:${THROW_LINE}:`);
    expect(stacks[1]!.stack).toContain(`entry.js:${THROW_LINE}:`);
  }, 30_000);

  it("wrong-build map (right basename, different build) does not crash and keeps raw stack recoverable", async () => {
    const { createProject } = await import("./projects");
    const { getIssue, listIssues } = await import("./issues");
    const project = await createProject("Stress Wrong Map", "stress-wrong-map");

    // Upload the map from build A under the file name of build B.
    const buildA = await buildEsbuild("wrong-a.js", true);
    const buildB = await buildEsbuild("wrong-b.js", false);
    const { storeSourceMap } = await import("./sourcemaps");
    const stored = await storeSourceMap({
      projectId: project.slug,
      release: "1.0.0",
      fileName: buildB.mapFileName,
      map: buildA.map,
    });
    expect(stored).toEqual({ ok: true });

    const stack = await captureStack(buildB.bundleFile);
    const { ingestEvents } = await import("./issues");
    await ingestEvents(project.id, [
      {
        eventId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level: "error",
        error: { name: "TypeError", message: "stress fixture exploded", stack },
        environment: "stress",
        release: "1.0.0",
        platform: "browser",
        runtime: "test",
        breadcrumbs: [],
        tags: {},
        context: {},
      },
    ]);

    // Wrong-map symbolication may produce misleading positions — that is a
    // documented limitation — but ingest must succeed and the raw stack must
    // be preserved so the mistake is diagnosable.
    const issues = await listIssues({ projectId: project.id });
    expect(issues).toHaveLength(1);
    const detail = await getIssue(issues[0]!.id);
    const sample = detail?.samples[0];
    const stored_stack = sample?.stack ?? "";
    if (stored_stack !== stack) {
      expect(String(sample?.context["rawStack"] ?? "")).toBe(stack);
    }
  }, 30_000);
});
