import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ErrorEvent } from "@kenkaiiii/error-mom-protocol";

const databaseUrl = process.env.TEST_DATABASE_URL;

// One mapping: generated 1:11 -> src/main.ts:5:3, name "boom".
const TINY_MAP = {
  version: 3,
  file: "app.js",
  sources: ["src/main.ts"],
  names: ["boom"],
  mappings: "UAIEA",
};

function stressEvent(release: string, message: string): ErrorEvent {
  return {
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level: "error",
    error: {
      name: "TypeError",
      message,
      stack: `TypeError: ${message}\n    at t.xyz (https://x/assets/app.js:1:11)`,
    },
    environment: "stress",
    release,
    platform: "browser",
    runtime: "test",
    breadcrumbs: [],
    tags: {},
    context: {},
  };
}

describe.runIf(Boolean(databaseUrl))("source map storage limits and ingest under load", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    const { ensureSchema } = await import("./db");
    await ensureSchema();
  });

  afterAll(async () => {
    const { database } = await import("./db");
    await database().end();
  });

  it("enforces the per-release file cap and rejects the file beyond it", async () => {
    const { createProject } = await import("./projects");
    const { storeSourceMap, MAX_FILES_PER_RELEASE } = await import("./sourcemaps");
    const project = await createProject("Stress File Cap", "stress-file-cap");

    // Insert in parallel batches — 200 sequential roundtrips are needlessly slow.
    const names = Array.from({ length: MAX_FILES_PER_RELEASE }, (_, i) => `chunk-${i}.js`);
    for (let start = 0; start < names.length; start += 25) {
      const results = await Promise.all(
        names
          .slice(start, start + 25)
          .map((fileName) =>
            storeSourceMap({ projectId: project.id, release: "1.0.0", fileName, map: TINY_MAP }),
          ),
      );
      for (const result of results) expect(result.ok).toBe(true);
    }

    const beyondCap = await storeSourceMap({
      projectId: project.id,
      release: "1.0.0",
      fileName: "one-too-many.js",
      map: TINY_MAP,
    });
    expect(beyondCap).toMatchObject({ ok: false, status: 409 });

    // Re-uploading an existing file is an upsert, not a new slot — still allowed.
    const reupload = await storeSourceMap({
      projectId: project.id,
      release: "1.0.0",
      fileName: "chunk-0.js",
      map: TINY_MAP,
    });
    expect(reupload).toEqual({ ok: true });
  }, 60_000);

  it("prunes maps beyond the most recent releases", async () => {
    const { createProject } = await import("./projects");
    const { storeSourceMap, MAX_RELEASES_PER_PROJECT } = await import("./sourcemaps");
    const { database } = await import("./db");
    const project = await createProject("Stress Release Prune", "stress-release-prune");

    for (let i = 0; i < MAX_RELEASES_PER_PROJECT + 1; i += 1) {
      const stored = await storeSourceMap({
        projectId: project.id,
        release: `1.0.${i}`,
        fileName: "app.js",
        map: TINY_MAP,
      });
      expect(stored).toEqual({ ok: true });
      // created_at drives pruning order; ensure strictly increasing stamps.
      await database()`
          UPDATE release_sourcemaps SET created_at = now() + make_interval(secs => ${i})
          WHERE project_id = ${project.id} AND release = ${`1.0.${i}`}
        `;
    }

    const releases = await database()<Array<{ release: string }>>`
        SELECT DISTINCT release FROM release_sourcemaps WHERE project_id = ${project.id}
      `;
    expect(releases).toHaveLength(MAX_RELEASES_PER_PROJECT);
    expect(releases.map((row) => row.release)).not.toContain("1.0.0");
    expect(releases.map((row) => row.release)).toContain(`1.0.${MAX_RELEASES_PER_PROJECT}`);
  }, 60_000);

  it("30 concurrent ingests of the same fingerprint converge on one issue", async () => {
    const { createProject } = await import("./projects");
    const { storeSourceMap } = await import("./sourcemaps");
    const { ingestEvents, listIssues } = await import("./issues");
    const project = await createProject("Stress Concurrency", "stress-concurrency");
    await storeSourceMap({
      projectId: project.id,
      release: "1.0.0",
      fileName: "app.js",
      map: TINY_MAP,
    });

    await Promise.all(
      Array.from({ length: 30 }, () =>
        ingestEvents(project.id, [stressEvent("1.0.0", "concurrent boom")]),
      ),
    );

    const issues = await listIssues({ projectId: project.id });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.quantity).toBe(30);
    expect(issues[0]?.culprit).toContain("src/main.ts:5:3");
  }, 60_000);

  it("symbolication keeps ingest latency sane", async () => {
    const { createProject } = await import("./projects");
    const { storeSourceMap } = await import("./sourcemaps");
    const { ingestEvents } = await import("./issues");
    const project = await createProject("Stress Latency", "stress-latency");
    // A wide (but valid) map: repeat the tiny segment across 2k lines.
    await storeSourceMap({
      projectId: project.id,
      release: "1.0.0",
      fileName: "app.js",
      map: { ...TINY_MAP, mappings: Array.from({ length: 2_000 }, () => "UAIEA").join(";") },
    });

    const rounds = 20;
    const start = performance.now();
    for (let i = 0; i < rounds; i += 1) {
      await ingestEvents(project.id, [stressEvent("1.0.0", `latency boom ${i % 3}`)]);
    }
    const perEvent = (performance.now() - start) / rounds;
    // Generous CI-safe bound; the point is catching pathological regressions
    // (e.g. re-parsing maps per frame), not micro-benchmarks.
    expect(perEvent).toBeLessThan(500);
    // eslint-disable-next-line no-console
    console.log(`symbolicated ingest: ${perEvent.toFixed(1)}ms/event`);
  }, 60_000);
});
