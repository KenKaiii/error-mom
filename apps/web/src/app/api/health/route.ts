import { database, ensureSchema } from "@/lib/db";

export async function GET(): Promise<Response> {
  try {
    await ensureSchema();
    await database()`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch (error) {
    return Response.json(
      { status: "error", message: error instanceof Error ? error.message : "Database unavailable" },
      { status: 503 },
    );
  }
}
