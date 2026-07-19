import postgres, { type Sql } from "postgres";
import { DATABASE_SCHEMA } from "./schema";

const globalDatabase = globalThis as typeof globalThis & {
  errorMomSql?: Sql;
  errorMomSchemaReady?: Promise<void>;
};

export function database(): Sql {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const sslMode = process.env.DATABASE_SSL;
  let hostname = "";
  try {
    hostname = new URL(connectionString).hostname;
  } catch {
    // postgres() reports malformed connection strings with a clearer error below.
  }
  const disableSsl =
    sslMode === "disable" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".railway.internal") ||
    hostname === "railway.internal";
  globalDatabase.errorMomSql ??= postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: disableSsl ? false : "require",
  });
  return globalDatabase.errorMomSql;
}

export async function ensureSchema(): Promise<void> {
  globalDatabase.errorMomSchemaReady ??= (async () => {
    const sql = database();
    await sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(17290311)`;
      await transaction.unsafe(DATABASE_SCHEMA);
    });
  })();
  return globalDatabase.errorMomSchemaReady;
}
