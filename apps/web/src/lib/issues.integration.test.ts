import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ErrorEvent } from "@kenkaiiii/error-mom-protocol";

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(databaseUrl))("issue ingestion with PostgreSQL", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    const { database, ensureSchema } = await import("./db");
    await ensureSchema();
    await database()`TRUNCATE projects CASCADE`;
  });

  afterAll(async () => {
    const { database } = await import("./db");
    await database().end();
  });

  it("deduplicates retries, groups repeats, and reopens fixed releases", async () => {
    const { createProject } = await import("./projects");
    const { findProjectByIngestKey, getIssue, ingestEvents, listIssues, resolveIssue } =
      await import("./issues");
    const project = await createProject("Video Editor");
    expect((await findProjectByIngestKey(project.ingestKey))?.id).toBe(project.id);

    const first = event("0c80c1f4-84dc-40d2-bdf9-167679238e91", "1.0.0", 42, 12);
    await ingestEvents(project.id, [first, first]);
    const repeated = event("c6ef0e95-e9c6-4a4a-8f60-f3c212ed82e1", "1.0.0", 981, 88);
    await ingestEvents(project.id, [repeated]);

    const openIssues = await listIssues({ projectId: project.id });
    expect(openIssues).toHaveLength(1);
    expect(openIssues[0]?.quantity).toBe(2);

    const issueId = openIssues[0]!.id;
    await resolveIssue(issueId, "1.1.0");
    await ingestEvents(project.id, [
      event("7333036c-26ac-42a2-88a3-cc63418ce77b", "1.0.1", 77, 91),
    ]);
    expect((await getIssue(issueId))?.status).toBe("resolved");

    await ingestEvents(project.id, [
      event("b457e4b4-da26-45a5-8a97-30deaa7c986d", "1.1.0", 51, 102),
    ]);
    const regressed = await getIssue(issueId);
    expect(regressed?.status).toBe("regressed");
    expect(regressed?.quantity).toBe(4);
  });

  it("symbolicates minified stacks with uploaded source maps before grouping", async () => {
    const { createProject } = await import("./projects");
    const { getIssue, ingestEvents, listIssues } = await import("./issues");
    const { storeSourceMap } = await import("./sourcemaps");

    const project = await createProject("Minified App");
    // One mapping: generated 1:11 -> src/main.ts:5:3, name "boom" (VLQ "UAIEA").
    const stored = await storeSourceMap({
      projectId: project.slug,
      release: "2.0.0",
      fileName: "index-B2kj9.js",
      map: {
        version: 3,
        file: "index-B2kj9.js",
        sources: ["src/main.ts"],
        names: ["boom"],
        mappings: "UAIEA",
      },
    });
    expect(stored.ok).toBe(true);

    const rawStack =
      "TypeError: boom failed\n    at t.xyz (https://example.com/assets/index-B2kj9.js:1:11)";
    await ingestEvents(project.id, [
      {
        eventId: "5b1c8e12-0000-4000-8000-000000000042",
        timestamp: new Date().toISOString(),
        level: "error",
        error: { name: "TypeError", message: "boom failed", stack: rawStack },
        culprit: "at t.xyz (https://example.com/assets/index-B2kj9.js:1:11)",
        environment: "production",
        release: "2.0.0",
        platform: "browser",
        runtime: "chrome",
        breadcrumbs: [],
        tags: {},
        context: {},
      },
    ]);

    const issues = await listIssues({ projectId: project.id });
    expect(issues).toHaveLength(1);
    // Symbolicated culprit wins over the SDK's minified culprit.
    expect(issues[0]?.culprit).toContain("src/main.ts:5:3");

    const detail = await getIssue(issues[0]!.id);
    // Exact frame: indentation preserved, single "at", original fn/file/line.
    expect(detail?.samples[0]?.stack).toContain("\n    at boom (src/main.ts:5:3)");
    expect(detail?.samples[0]?.context["rawStack"]).toBe(rawStack);

    // Same bug from a differently-minified build groups into the same issue.
    const otherBuildStored = await storeSourceMap({
      projectId: project.id,
      release: "2.0.1",
      fileName: "index-Zz9q1.js",
      map: {
        version: 3,
        file: "index-Zz9q1.js",
        sources: ["src/main.ts"],
        names: ["boom"],
        mappings: "UAIEA",
      },
    });
    expect(otherBuildStored.ok).toBe(true);
    await ingestEvents(project.id, [
      {
        eventId: "5b1c8e12-0000-4000-8000-000000000043",
        timestamp: new Date().toISOString(),
        level: "error",
        error: {
          name: "TypeError",
          message: "boom failed",
          stack:
            "TypeError: boom failed\n    at Q.ab (https://example.com/assets/index-Zz9q1.js:1:11)",
        },
        environment: "production",
        release: "2.0.1",
        platform: "browser",
        runtime: "chrome",
        breadcrumbs: [],
        tags: {},
        context: {},
      },
    ]);
    const grouped = await listIssues({ projectId: project.id });
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.quantity).toBe(2);
  });

  it("deletes a project and cascades issues, keys, and receipts", async () => {
    const { createProject, deleteProject } = await import("./projects");
    const { findProjectByIngestKey, ingestEvents, listIssues } = await import("./issues");
    const { database } = await import("./db");

    const project = await createProject("Doomed Project");
    await ingestEvents(project.id, [event("d3ad3ea7-0000-4000-8000-000000000001", "1.0.0", 1, 10)]);
    expect(await listIssues({ projectId: project.id })).toHaveLength(1);

    expect(await deleteProject(project.id)).toBe(true);
    expect(await deleteProject(project.id)).toBe(false); // already gone

    expect(await findProjectByIngestKey(project.ingestKey)).toBeNull();
    expect(await listIssues({ projectId: project.id })).toHaveLength(0);
    const orphans = await database()<Array<{ count: string }>>`
      SELECT count(*) AS count FROM event_receipts WHERE project_id = ${project.id}
    `;
    expect(Number(orphans[0]?.count)).toBe(0);
  });
});

function event(eventId: string, release: string, userId: number, line: number): ErrorEvent {
  return {
    eventId,
    timestamp: new Date().toISOString(),
    level: "error",
    error: {
      name: "TypeError",
      message: `Could not render user ${userId}`,
      stack: `TypeError: Could not render user ${userId}\n    at render (/app/src/render.ts:${line}:4)`,
    },
    environment: "test",
    release,
    platform: "linux",
    runtime: "node test",
    breadcrumbs: [],
    tags: {},
    context: {},
  };
}
