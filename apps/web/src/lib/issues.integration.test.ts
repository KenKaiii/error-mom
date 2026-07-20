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
    expect((await findProjectByIngestKey(project.ingestKey!))?.id).toBe(project.id);

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

  it("reuses an existing project instead of creating a slug-suffixed duplicate", async () => {
    const { createProject } = await import("./projects");

    const original = await createProject("Dup Check");
    expect(original.existing).toBe(false);
    expect(original.ingestKey).toBeTruthy();

    // Same name, name that slugifies identically, and explicit slug all
    // resolve to the original project; no ingest key is re-issued.
    for (const retry of [
      await createProject("Dup Check"),
      await createProject("dup-check"),
      await createProject("Different Name", "dup-check"),
    ]) {
      expect(retry.id).toBe(original.id);
      expect(retry.existing).toBe(true);
      expect(retry.ingestKey).toBeUndefined();
    }
  });

  it("redacts unsafe non-SDK events before fingerprinting and persistence", async () => {
    const { createProject } = await import("./projects");
    const { getIssue, ingestEvents, listIssues } = await import("./issues");
    const project = await createProject("Unsafe Caller");
    const telegram = ["987654", "MESSAGE_SENTINEL"].join(":");
    const userinfo = ["stack-user", "STACK_SENTINEL"].join(":");
    const sentinels = [
      telegram,
      userinfo,
      "TAG_SENTINEL",
      "CONTEXT_SENTINEL",
      "URL_SENTINEL",
      "CULPRIT_SENTINEL",
      "BREADCRUMB_SENTINEL",
    ];
    const unsafeEvent: ErrorEvent = {
      eventId: "5b1c8e12-0000-4000-8000-000000000099",
      timestamp: new Date().toISOString(),
      level: "error",
      error: {
        name: "UnsafeRequestError",
        message: `POST https://api.telegram.org/bot${telegram}/sendMessage returned 500`,
        stack: `UnsafeRequestError at https://${userinfo}@example.com/jobs/42`,
      },
      environment: "test",
      platform: "external",
      runtime: "direct API caller",
      url: "https://example.com/run?access_token=URL_SENTINEL&mode=safe",
      culprit: "https://discord.com/api/webhooks/123/CULPRIT_SENTINEL",
      breadcrumbs: [
        {
          timestamp: new Date().toISOString(),
          category: "http",
          level: "error",
          message: "POST https://hooks.slack.com/services/T000/B000/BREADCRUMB_SENTINEL failed",
          data: { status: 500 },
        },
      ],
      tags: { endpoint: "https://example.com/token/TAG_SENTINEL/resource" },
      context: { callback: "https://example.com/api-key/CONTEXT_SENTINEL/run" },
    };

    await ingestEvents(project.id, [unsafeEvent]);

    const issues = await listIssues({ projectId: project.id });
    expect(issues).toHaveLength(1);
    const detail = await getIssue(issues[0]!.id);
    expect(detail).not.toBeNull();
    const persisted = JSON.stringify(detail);
    for (const sentinel of sentinels) expect(persisted).not.toContain(sentinel);
    expect(detail?.title).toContain("api.telegram.org/bot[REDACTED]/sendMessage");
    expect(detail?.culprit).toContain("discord.com/api/webhooks/[REDACTED]/[REDACTED]");
    expect(detail?.samples[0]?.stack).toContain("example.com/jobs/42");
    expect(detail?.samples[0]?.tags.endpoint).toContain("/token/[REDACTED]/resource");
    expect(detail?.samples[0]?.context.callback).toContain("/api-key/[REDACTED]/run");
    expect(detail?.samples[0]?.breadcrumbs[0]?.message).toContain("/services/[REDACTED]");
  });

  it("observes operational noise and promotes it on the third occurrence", async () => {
    const { createProject } = await import("./projects");
    const { getIssue, ingestEvents, listIssues } = await import("./issues");
    const project = await createProject("Noise Promotion");

    await ingestEvents(project.id, [operationalEvent("10000000-0000-4000-8000-000000000001")]);
    expect(await listIssues({ projectId: project.id })).toHaveLength(0);
    const observed = await listIssues({ projectId: project.id, status: "observed" });
    expect(observed).toHaveLength(1);
    expect(observed[0]).toMatchObject({ status: "observed", quantity: 1 });
    const detail = await getIssue(observed[0]!.id);
    expect(detail?.samples[0]?.tags).toMatchObject({
      errorMomClassification: "operational",
      errorMomReason: "quota",
      errorMomRetryable: "true",
    });
    expect(detail?.samples[0]?.context.errorMomTriage).toMatchObject({
      classification: "operational",
      promotionQuantity: 3,
    });

    await ingestEvents(project.id, [
      operationalEvent("10000000-0000-4000-8000-000000000002"),
      operationalEvent("10000000-0000-4000-8000-000000000003"),
    ]);

    expect(await listIssues({ projectId: project.id, status: "observed" })).toHaveLength(0);
    expect(await listIssues({ projectId: project.id })).toEqual([
      expect.objectContaining({ status: "open", quantity: 3 }),
    ]);
  });

  it("groups tool failures across orchestration stack changes", async () => {
    const { createProject } = await import("./projects");
    const { ingestEvents, listIssues } = await import("./issues");
    const project = await createProject("Tool Grouping");
    const first = event("20000000-0000-4000-8000-000000000001", "1.0.0", 1, 10);
    const second = event("20000000-0000-4000-8000-000000000002", "1.1.0", 2, 20);
    first.error = {
      name: "Error",
      message: "Tool grep failed",
      stack: "Error: Tool grep failed\n    at runAgent (app-sidecar.mjs:100:2)",
    };
    first.culprit = "tool.grep";
    second.error = {
      name: "Error",
      message: "Tool grep failed",
      stack: "Error: Tool grep failed\n    at driveAutopilotCycle (app-sidecar.mjs:900:8)",
    };
    second.culprit = "tool.grep";

    await ingestEvents(project.id, [first, second]);

    expect(await listIssues({ projectId: project.id })).toHaveLength(0);
    expect(await listIssues({ projectId: project.id, status: "observed" })).toEqual([
      expect.objectContaining({ title: "Tool grep failed", status: "observed", quantity: 2 }),
    ]);
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

    expect(await findProjectByIngestKey(project.ingestKey!)).toBeNull();
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

function operationalEvent(eventId: string): ErrorEvent {
  return {
    eventId,
    timestamp: new Date().toISOString(),
    level: "error",
    error: { name: "ProviderError", message: "Claude usage limit reached" },
    culprit: "app-sidecar.autopilot-review-failed",
    environment: "test",
    release: "1.0.0",
    platform: "linux",
    runtime: "node test",
    breadcrumbs: [],
    tags: { provider: "anthropic", status: "429" },
    context: {},
  };
}
