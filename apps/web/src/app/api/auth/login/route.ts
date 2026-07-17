import { NextResponse } from "next/server";
import { adminToken, dashboardSession, SESSION_COOKIE } from "@/lib/auth";
import { constantTimeEqual } from "@/lib/security";

export async function POST(request: Request): Promise<Response> {
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

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(SESSION_COOKIE, dashboardSession(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
