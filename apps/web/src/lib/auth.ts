import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { constantTimeEqual, sha256 } from "./security";

export const SESSION_COOKIE = "error_mom_session";

export function adminToken(): string {
  const token = process.env.ERROR_MOM_ADMIN_TOKEN;
  if (!token || token.length < 32) {
    throw new Error("ERROR_MOM_ADMIN_TOKEN must contain at least 32 characters");
  }
  return token;
}

export function dashboardSession(): string {
  return sha256(`error-mom-dashboard:${adminToken()}`);
}

export async function isPageAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  return constantTimeEqual(session, dashboardSession());
}

export function isApiAuthenticated(request: NextRequest): boolean {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (bearer && constantTimeEqual(bearer, adminToken())) return true;
  const session = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  return constantTimeEqual(session, dashboardSession());
}

export function unauthorized(): Response {
  return Response.json(
    { error: { code: "unauthorized", message: "A valid Error Mom admin token is required." } },
    { status: 401 },
  );
}
