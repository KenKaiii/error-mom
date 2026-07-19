import type { Sql } from "postgres";
import { database, ensureSchema } from "./db";

export const MAX_MAP_BYTES = 20 * 1024 * 1024;
export const MAX_FILES_PER_RELEASE = 200;
export const MAX_RELEASES_PER_PROJECT = 20;

export type StoreSourceMapResult =
  { ok: true } | { ok: false; code: string; message: string; status: number };

/** Accepts a project id or its slug; returns the canonical id or null. */
export async function resolveProjectId(sql: Sql, idOrSlug: string): Promise<string | null> {
  const rows = await sql<Array<{ id: string }>>`
    SELECT id FROM projects WHERE id = ${idOrSlug} OR slug = ${idOrSlug} LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

export async function storeSourceMap(input: {
  projectId: string;
  release: string;
  fileName: string;
  map: Record<string, unknown>;
}): Promise<StoreSourceMapResult> {
  await ensureSchema();
  const sql = database();

  // Accept either the project id or its slug so CLI users can pass the
  // human-readable slug from the dashboard.
  const projectId = await resolveProjectId(sql, input.projectId);
  if (!projectId) {
    return {
      ok: false,
      code: "project_not_found",
      message: "No project matches that id or slug.",
      status: 404,
    };
  }

  const countRows = await sql<Array<{ file_count: string }>>`
    SELECT count(*)::text AS file_count
    FROM release_sourcemaps
    WHERE project_id = ${projectId} AND release = ${input.release}
      AND file_name <> ${input.fileName}
  `;
  if (Number(countRows[0]?.file_count ?? 0) >= MAX_FILES_PER_RELEASE) {
    return {
      ok: false,
      code: "too_many_maps",
      message: `Releases are limited to ${MAX_FILES_PER_RELEASE} source maps.`,
      status: 409,
    };
  }

  await sql`
    INSERT INTO release_sourcemaps (project_id, release, file_name, map)
    VALUES (${projectId}, ${input.release}, ${input.fileName}, ${sql.json(JSON.parse(JSON.stringify(input.map)))})
    ON CONFLICT (project_id, release, file_name) DO UPDATE
    SET map = EXCLUDED.map, created_at = now()
  `;

  // Bound storage growth: keep maps only for the most recent releases.
  await sql`
    DELETE FROM release_sourcemaps
    WHERE project_id = ${projectId}
      AND release NOT IN (
        SELECT release
        FROM release_sourcemaps
        WHERE project_id = ${projectId}
        GROUP BY release
        ORDER BY max(created_at) DESC
        LIMIT ${MAX_RELEASES_PER_PROJECT}
      )
  `;
  return { ok: true };
}
