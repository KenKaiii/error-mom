import { database, ensureSchema } from "../src/lib/db";

await ensureSchema();
await database().end();
process.stdout.write("Error Mom database schema is ready.\n");
