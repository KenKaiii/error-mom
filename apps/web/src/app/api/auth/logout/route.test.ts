import { beforeEach, describe, expect, it, vi } from "vitest";

const destroySession = vi.fn();

vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE: "error_mom_session",
  destroySession: (...args: unknown[]) => destroySession(...args),
}));

const { POST } = await import("./route");

describe("logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    destroySession.mockResolvedValue(undefined);
  });

  it("destroys the session, clears its cookie, and redirects to login", async () => {
    const response = await POST(
      new Request("https://errors.example.com/api/auth/logout", {
        method: "POST",
        headers: { cookie: "error_mom_session=sess_test%3Avalue; theme=system" },
      }),
    );

    expect(destroySession).toHaveBeenCalledWith("sess_test:value");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://errors.example.com/login");
    expect(response.headers.get("set-cookie")).toContain("error_mom_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
