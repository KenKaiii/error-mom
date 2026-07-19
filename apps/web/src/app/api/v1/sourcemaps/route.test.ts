import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN_TOKEN = "admin-token-0123456789-0123456789-abc";

// Realistic subset of the real auth: only the admin bearer token passes.
// Ingest keys (x-error-mom-key) never satisfy isApiAuthenticated.
vi.mock("@/lib/auth", () => ({
  isApiAuthenticated: async (request: Request) =>
    request.headers.get("authorization") === `Bearer ${ADMIN_TOKEN}`,
  unauthorized: () => Response.json({ error: { code: "unauthorized" } }, { status: 401 }),
}));

const storeSourceMap = vi.fn();
vi.mock("@/lib/sourcemaps", () => ({
  MAX_MAP_BYTES: 20 * 1024 * 1024,
  storeSourceMap: (...args: unknown[]) => storeSourceMap(...args),
}));

const { POST } = await import("./route");

function upload(options: {
  headers?: Record<string, string>;
  body?: unknown;
  contentLength?: number;
}): Promise<Response> {
  const body = JSON.stringify(
    options.body ?? {
      projectId: "project_test",
      release: "1.0.0",
      fileName: "index-B2kj9.js",
      map: { version: 3, sources: ["src/main.ts"], names: [], mappings: "AAAA" },
    },
  );
  const headers = new Headers({ "content-type": "application/json", ...options.headers });
  if (options.contentLength) headers.set("content-length", String(options.contentLength));
  return POST(
    // Route only reads headers/json, so a plain Request is sufficient.
    new Request("http://localhost/api/v1/sourcemaps", { method: "POST", headers, body }) as never,
  );
}

describe("sourcemaps upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeSourceMap.mockResolvedValue({ ok: true });
  });

  it("stores a map with the admin token", async () => {
    const response = await upload({ headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ stored: true });
    expect(storeSourceMap).toHaveBeenCalledTimes(1);
  });

  it("rejects ingest keys with 401 — shipped-bundle keys must never upload maps", async () => {
    const response = await upload({ headers: { "x-error-mom-key": "em_ingest_public_key" } });
    expect(response.status).toBe(401);
    expect(storeSourceMap).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated uploads with 401", async () => {
    const response = await upload({});
    expect(response.status).toBe(401);
    expect(storeSourceMap).not.toHaveBeenCalled();
  });

  it("rejects oversized maps with 413", async () => {
    const response = await upload({
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      contentLength: 25 * 1024 * 1024,
    });
    expect(response.status).toBe(413);
    expect(storeSourceMap).not.toHaveBeenCalled();
  });

  it("rejects file names containing path separators", async () => {
    const response = await upload({
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      body: {
        projectId: "project_test",
        release: "1.0.0",
        fileName: "../evil.js",
        map: { version: 3, sources: [], names: [], mappings: "AAAA" },
      },
    });
    expect(response.status).toBe(400);
    expect(storeSourceMap).not.toHaveBeenCalled();
  });
});
