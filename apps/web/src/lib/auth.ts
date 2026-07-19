import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { database, ensureSchema } from "./db";
import { constantTimeEqual, createIdentifier, sha256 } from "./security";

export const SESSION_COOKIE = "error_mom_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function adminToken(): string {
  const token = process.env.ERROR_MOM_ADMIN_TOKEN;
  if (!token || token.length < 32) {
    throw new Error("ERROR_MOM_ADMIN_TOKEN must contain at least 32 characters");
  }
  return token;
}

export async function createSession(): Promise<string> {
  await ensureSchema();
  const sql = database();
  const session = createIdentifier("sess");
  await sql`DELETE FROM admin_sessions WHERE expires_at < now()`;
  await sql`
    INSERT INTO admin_sessions (token_hash, expires_at)
    VALUES (${sha256(session)}, now() + make_interval(secs => ${SESSION_MAX_AGE_SECONDS}))
  `;
  return session;
}

export async function destroySession(session: string): Promise<void> {
  if (!session) return;
  await ensureSchema();
  const sql = database();
  await sql`DELETE FROM admin_sessions WHERE token_hash = ${sha256(session)}`;
}

async function isSessionValid(session: string): Promise<boolean> {
  if (!session.startsWith("sess_")) return false;
  await ensureSchema();
  const sql = database();
  const rows = await sql<Array<{ ok: boolean }>>`
    SELECT true AS ok
    FROM admin_sessions
    WHERE token_hash = ${sha256(session)} AND expires_at > now()
    LIMIT 1
  `;
  return rows.length === 1;
}

export async function isPageAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  return isSessionValid(session);
}

export async function isApiAuthenticated(request: NextRequest): Promise<boolean> {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (bearer && constantTimeEqual(bearer, adminToken())) return true;
  const session = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  return isSessionValid(session);
}

export function unauthorized(): Response {
  return Response.json(
    { error: { code: "unauthorized", message: "A valid Error Mom admin token is required." } },
    { status: 401 },
  );
}
