import { NextResponse } from "next/server";
import { adminToken, createSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { constantTimeEqual } from "@/lib/security";

const MAX_ATTEMPTS_PER_WINDOW = 10;
const WINDOW_MS = 60_000;
const attempts = new Map<string, { windowStart: number; count: number }>();

function isRateLimited(request: Request): boolean {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const entry = attempts.get(client);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    if (attempts.size > 10_000) attempts.clear();
    attempts.set(client, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS_PER_WINDOW;
}

export async function POST(request: Request): Promise<Response> {
  if (isRateLimited(request)) {
    return Response.json(
      { error: "Too many login attempts. Try again in a minute." },
      { status: 429, headers: { "retry-after": "60" } },
    );
  }

  let token = "";
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token : "";
  } catch {
    return Response.json({ error: "Enter your admin token." }, { status: 400 });
  }

  if (!constantTimeEqual(token, adminToken())) {
    return Response.json({ error: "That admin token is not valid." }, { status: 401 });
  }

  const session = await createSession();
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
