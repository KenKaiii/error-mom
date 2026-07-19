import { database, ensureSchema } from "@/lib/db";

export async function GET(): Promise<Response> {
  try {
    await ensureSchema();
    await database()`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch (error) {
    console.error("Health check failed:", error);
    return Response.json({ status: "error", message: "Database unavailable" }, { status: 503 });
  }
}
