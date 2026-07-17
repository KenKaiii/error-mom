import { database, ensureSchema } from "./db";
import { createIdentifier, createIngestKey, sha256 } from "./security";

export interface CreatedProject {
  id: string;
  name: string;
  slug: string;
  ingestKey: string;
}

export async function createProject(name: string, requestedSlug?: string): Promise<CreatedProject> {
  await ensureSchema();
  const sql = database();
  const cleanName = name.trim().slice(0, 100);
  if (cleanName.length < 2) throw new Error("Project name must contain at least 2 characters.");
  const baseSlug = slugify(requestedSlug || cleanName);
  if (!baseSlug) throw new Error("Project slug must contain letters or numbers.");

  const id = createIdentifier("project");
  const ingestKey = createIngestKey();
  let slug = baseSlug;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const existing = await sql<Array<{ exists: boolean }>>`
      SELECT EXISTS(SELECT 1 FROM projects WHERE slug = ${slug}) AS exists
    `;
    if (!existing[0]?.exists) break;
    slug = `${baseSlug}-${attempt + 2}`;
  }

  await sql`
    INSERT INTO projects (id, name, slug, ingest_key_hash)
    VALUES (${id}, ${cleanName}, ${slug}, ${sha256(ingestKey)})
  `;
  return { id, name: cleanName, slug, ingestKey };
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}
