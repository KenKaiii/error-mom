import { database, ensureSchema } from "./db";
import { createIdentifier, createIngestKey, sha256 } from "./security";

export interface CreatedProject {
  id: string;
  name: string;
  slug: string;
  /** Present only when the project was just created; existing projects store only the hash. */
  ingestKey?: string;
  existing: boolean;
}

export async function createProject(name: string, requestedSlug?: string): Promise<CreatedProject> {
  await ensureSchema();
  const sql = database();
  const cleanName = name.trim().slice(0, 100);
  if (cleanName.length < 2) throw new Error("Project name must contain at least 2 characters.");
  const slug = slugify(requestedSlug || cleanName);
  if (!slug) throw new Error("Project slug must contain letters or numbers.");

  // Idempotent create: agents re-running `error-mom init` (or retrying a
  // request) must reuse the project instead of minting slug-2 duplicates.
  const existing = await findProjectBySlug(sql, slug);
  if (existing) return { ...existing, existing: true };

  const id = createIdentifier("project");
  const ingestKey = createIngestKey();
  try {
    await sql`
      INSERT INTO projects (id, name, slug, ingest_key_hash)
      VALUES (${id}, ${cleanName}, ${slug}, ${sha256(ingestKey)})
    `;
  } catch (error) {
    // Concurrent create with the same slug: the unique constraint wins the
    // race, so return the row that got there first.
    if (isUniqueViolation(error)) {
      const winner = await findProjectBySlug(sql, slug);
      if (winner) return { ...winner, existing: true };
    }
    throw error;
  }
  return { id, name: cleanName, slug, ingestKey, existing: false };
}

async function findProjectBySlug(
  sql: ReturnType<typeof database>,
  slug: string,
): Promise<{ id: string; name: string; slug: string } | null> {
  const rows = await sql<Array<{ id: string; name: string; slug: string }>>`
    SELECT id, name, slug FROM projects WHERE slug = ${slug} LIMIT 1
  `;
  return rows[0] ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505"
  );
}

export async function createProjectIngestKey(projectId: string): Promise<string | null> {
  await ensureSchema();
  const sql = database();
  const project = await sql<
    Array<{ id: string }>
  >`SELECT id FROM projects WHERE id = ${projectId} LIMIT 1`;
  if (!project[0]) return null;
  const ingestKey = createIngestKey();
  await sql`
    INSERT INTO project_ingest_keys (id, project_id, ingest_key_hash)
    VALUES (${createIdentifier("key")}, ${projectId}, ${sha256(ingestKey)})
  `;
  return ingestKey;
}

export async function deleteProject(projectId: string): Promise<boolean> {
  await ensureSchema();
  const sql = database();
  // Schema cascades: ingest keys, receipts, rate limits, issues, samples,
  // and releases all reference projects(id) ON DELETE CASCADE.
  const deleted = await sql<Array<{ id: string }>>`
    DELETE FROM projects WHERE id = ${projectId} RETURNING id
  `;
  return deleted.length > 0;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}
