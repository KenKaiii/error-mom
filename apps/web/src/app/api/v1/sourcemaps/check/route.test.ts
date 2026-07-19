import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN_TOKEN = "admin-token-0123456789-0123456789-abc";

vi.mock("@/lib/auth", () => ({
  isApiAuthenticated: async (request: Request) =>
    request.headers.get("authorization") === `Bearer ${ADMIN_TOKEN}`,
  unauthorized: () => Response.json({ error: { code: "unauthorized" } }, { status: 401 }),
}));

const symbolicateStack = vi.fn();
vi.mock("@/lib/db", () => ({
  database: () => ({}) as never,
  ensureSchema: async () => undefined,
}));
vi.mock("@/lib/sourcemaps", () => ({
  resolveProjectId: async (_sql: unknown, idOrSlug: string) =>
    idOrSlug === "known-project" ? "project_known" : null,
}));
vi.mock("@/lib/symbolicate", async () => ({
  // The @/ alias is not resolvable inside mock factories; use a relative path.
  ...(await vi.importActual<Record<string, unknown>>("../../../../../lib/symbolicate")),
  symbolicateStack: (...args: unknown[]) => symbolicateStack(...args),
}));

const { POST } = await import("./route");

const TINY_MAP = {
  version: 3,
  file: "app-abc.js",
  sources: ["src/main.ts"],
  names: ["boom"],
  mappings: "UAIEA",
};

function check(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request("http://localhost/api/v1/sourcemaps/check", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }) as never,
  );
}

const admin = { authorization: `Bearer ${ADMIN_TOKEN}` };

describe("sourcemaps check route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    symbolicateStack.mockResolvedValue({ stack: "at boom (src/main.ts:5:3)", symbolicated: true });
  });

  it("runs an inline dry-run without touching storage", async () => {
    const response = await check(
      {
        stack: "TypeError: boom\n    at t.xyz (https://x/app-abc.js:1:11)",
        fileName: "app-abc.js",
        map: TINY_MAP,
      },
      admin,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.mode).toBe("inline");
    expect(body.symbolicated).toBe(true);
    expect(body.stack).toContain("at boom (src/main.ts:5:3)");
    expect(symbolicateStack).not.toHaveBeenCalled();
  });

  it("checks stored maps by project slug and release", async () => {
    const response = await check(
      { stack: "at t.xyz (https://x/a.js:1:11)", projectId: "known-project", release: "1.0.0" },
      admin,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: "stored", symbolicated: true });
    expect(symbolicateStack).toHaveBeenCalledWith(
      expect.anything(),
      "project_known",
      "1.0.0",
      "at t.xyz (https://x/a.js:1:11)",
    );
  });

  it("404s for unknown projects in stored mode", async () => {
    const response = await check(
      { stack: "at x (a.js:1:1)", projectId: "nope", release: "1.0.0" },
      admin,
    );
    expect(response.status).toBe(404);
  });

  it("rejects ingest keys and missing auth with 401", async () => {
    const withIngestKey = await check(
      { stack: "s", fileName: "a.js", map: TINY_MAP },
      { "x-error-mom-key": "em_ingest_public" },
    );
    expect(withIngestKey.status).toBe(401);
    const noAuth = await check({ stack: "s", fileName: "a.js", map: TINY_MAP });
    expect(noAuth.status).toBe(401);
  });

  it("400s on unparseable inline maps and malformed bodies", async () => {
    const badMap = await check(
      { stack: "s", fileName: "a.js", map: { version: 3, mappings: 42 } },
      admin,
    );
    expect(badMap.status).toBe(400);
    const malformed = await check({ nothing: true }, admin);
    expect(malformed.status).toBe(400);
  });
});
