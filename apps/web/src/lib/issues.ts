import type {
  ErrorEvent,
  IssueDetail,
  IssueSample,
  IssueStatus,
  IssueSummary,
  ProjectSummary,
} from "@kenkaiiii/error-mom-protocol";
import semver from "semver";
import { database, ensureSchema } from "./db";
import { findCulprit, fingerprintError } from "./fingerprint";
import { createIdentifier, redact, sha256 } from "./security";

interface IssueRow {
  id: string;
  project_id: string;
  project_name: string;
  fingerprint: string;
  title: string;
  error_type: string;
  culprit: string | null;
  status: IssueStatus;
  quantity: string;
  first_seen: Date;
  last_seen: Date;
  latest_release: string | null;
  fixed_in_release: string | null;
}

export async function findProjectByIngestKey(
  key: string,
): Promise<{ id: string; name: string } | null> {
  await ensureSchema();
  const sql = database();
  const keyHash = sha256(key);
  const rows = await sql<Array<{ id: string; name: string }>>`
    SELECT p.id, p.name
    FROM projects p
    LEFT JOIN project_ingest_keys k ON k.project_id = p.id
    WHERE p.ingest_key_hash = ${keyHash} OR k.ingest_key_hash = ${keyHash}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  await ensureSchema();
  const sql = database();
  const rows = await sql<
    Array<{ id: string; name: string; slug: string; created_at: Date; open_issues: string }>
  >`
    SELECT p.id, p.name, p.slug, p.created_at,
      count(i.id) FILTER (WHERE i.status IN ('open', 'regressed'))::text AS open_issues
    FROM projects p
    LEFT JOIN issues i ON i.project_id = p.id
    GROUP BY p.id
    ORDER BY p.name ASC
  `;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    openIssues: Number(row.open_issues),
    createdAt: row.created_at.toISOString(),
  }));
}

export async function listIssues(
  filters: {
    projectId?: string;
    status?: IssueStatus | "unresolved" | "all";
    limit?: number;
  } = {},
): Promise<IssueSummary[]> {
  await ensureSchema();
  const sql = database();
  const status = filters.status ?? "unresolved";
  const projectId = filters.projectId ?? null;
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const rows = await sql<IssueRow[]>`
    SELECT i.id, i.project_id, p.name AS project_name, i.fingerprint, i.title, i.error_type,
      i.culprit, i.status, i.quantity::text, i.first_seen, i.last_seen,
      i.latest_release, i.fixed_in_release
    FROM issues i
    JOIN projects p ON p.id = i.project_id
    WHERE (${projectId}::text IS NULL OR i.project_id = ${projectId})
      AND (
        ${status} = 'all'
        OR (${status} = 'unresolved' AND i.status IN ('open', 'regressed'))
        OR i.status = ${status}
      )
    ORDER BY
      CASE i.status WHEN 'regressed' THEN 0 WHEN 'open' THEN 1 ELSE 2 END,
      i.last_seen DESC
    LIMIT ${limit}
  `;
  return rows.map(mapIssue);
}

export async function getIssue(issueId: string, sampleLimit = 20): Promise<IssueDetail | null> {
  await ensureSchema();
  const sql = database();
  const boundedSampleLimit = Math.min(Math.max(sampleLimit, 1), 20);
  const issueRows = await sql<IssueRow[]>`
    SELECT i.id, i.project_id, p.name AS project_name, i.fingerprint, i.title, i.error_type,
      i.culprit, i.status, i.quantity::text, i.first_seen, i.last_seen,
      i.latest_release, i.fixed_in_release
    FROM issues i
    JOIN projects p ON p.id = i.project_id
    WHERE i.id = ${issueId}
    LIMIT 1
  `;
  const issue = issueRows[0];
  if (!issue) return null;

  const sampleRows = await sql<
    Array<{
      id: string;
      event_id: string;
      occurred_at: Date;
      environment: string;
      release: string | null;
      platform: string;
      runtime: string;
      message: string;
      stack: string | null;
      breadcrumbs: IssueSample["breadcrumbs"];
      context: IssueSample["context"];
      tags: IssueSample["tags"];
    }>
  >`
    SELECT id, event_id, occurred_at, environment, release, platform, runtime,
      message, stack, breadcrumbs, context, tags
    FROM issue_samples
    WHERE issue_id = ${issueId}
    ORDER BY occurred_at DESC
    LIMIT ${boundedSampleLimit}
  `;
  const releaseRows = await sql<Array<{ release: string; quantity: string; last_seen: Date }>>`
    SELECT release, quantity::text, last_seen
    FROM issue_releases
    WHERE issue_id = ${issueId}
    ORDER BY last_seen DESC
  `;

  return {
    ...mapIssue(issue),
    samples: sampleRows.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      occurredAt: row.occurred_at.toISOString(),
      environment: row.environment,
      release: row.release,
      platform: row.platform,
      runtime: row.runtime,
      message: row.message,
      stack: row.stack,
      breadcrumbs: row.breadcrumbs,
      context: row.context,
      tags: row.tags,
    })),
    releases: releaseRows.map((row) => ({
      release: row.release,
      quantity: Number(row.quantity),
      lastSeen: row.last_seen.toISOString(),
    })),
  };
}

export async function reserveIngestCapacity(
  projectId: string,
  eventCount: number,
  limitPerMinute = 2_000,
): Promise<boolean> {
  if (eventCount < 1 || eventCount > limitPerMinute) return false;
  await ensureSchema();
  const sql = database();
  const rows = await sql<Array<{ event_count: number }>>`
    INSERT INTO ingest_rate_limits (project_id, window_start, event_count)
    VALUES (${projectId}, date_trunc('minute', now()), ${eventCount})
    ON CONFLICT (project_id, window_start) DO UPDATE
    SET event_count = ingest_rate_limits.event_count + EXCLUDED.event_count
    WHERE ingest_rate_limits.event_count + EXCLUDED.event_count <= ${limitPerMinute}
    RETURNING event_count
  `;
  await sql`DELETE FROM ingest_rate_limits WHERE window_start < now() - interval '10 minutes'`;
  return rows.length === 1;
}

export async function ingestEvents(projectId: string, events: ErrorEvent[]): Promise<void> {
  await ensureSchema();
  const sql = database();
  await sql.begin(async (transaction) => {
    await transaction`DELETE FROM event_receipts WHERE received_at < now() - interval '30 days'`;
    for (const unsafeEvent of events) {
      const event = redact(unsafeEvent) as ErrorEvent;
      const receipt = await transaction<Array<{ event_id: string }>>`
        INSERT INTO event_receipts (project_id, event_id)
        VALUES (${projectId}, ${event.eventId})
        ON CONFLICT DO NOTHING
        RETURNING event_id
      `;
      if (receipt.length === 0) continue;
      const fingerprint = fingerprintError(
        event.error.name,
        event.error.message,
        event.error.stack,
      );
      await transaction`
        SELECT pg_advisory_xact_lock(hashtextextended(${`${projectId}:${fingerprint}`}, 0))
      `;
      const existingRows = await transaction<
        Array<{
          id: string;
          status: IssueStatus;
          fixed_in_release: string | null;
        }>
      >`
        SELECT id, status, fixed_in_release
        FROM issues
        WHERE project_id = ${projectId} AND fingerprint = ${fingerprint}
        FOR UPDATE
      `;
      const existing = existingRows[0];
      const issueId = existing?.id ?? createIdentifier("issue");
      const regression =
        existing?.status === "resolved" && isRegression(existing.fixed_in_release, event.release);
      const culprit = event.culprit ?? findCulprit(event.error.stack);
      const title = event.error.message.split("\n")[0]?.slice(0, 500) || event.error.name;

      if (existing) {
        await transaction`
          UPDATE issues
          SET quantity = quantity + 1,
              title = ${title},
              error_type = ${event.error.name},
              culprit = COALESCE(${culprit}, culprit),
              status = CASE WHEN ${regression} THEN 'regressed' ELSE status END,
              resolved_at = CASE WHEN ${regression} THEN NULL ELSE resolved_at END,
              latest_release = CASE
                WHEN ${event.timestamp} >= last_seen THEN COALESCE(${event.release ?? null}, latest_release)
                ELSE latest_release
              END,
              first_seen = LEAST(first_seen, ${event.timestamp}),
              last_seen = GREATEST(last_seen, ${event.timestamp}),
              updated_at = now()
          WHERE id = ${issueId}
        `;
      } else {
        await transaction`
          INSERT INTO issues (
            id, project_id, fingerprint, title, error_type, culprit,
            status, quantity, first_seen, last_seen, latest_release
          ) VALUES (
            ${issueId}, ${projectId}, ${fingerprint}, ${title}, ${event.error.name}, ${culprit},
            'open', 1, ${event.timestamp}, ${event.timestamp}, ${event.release ?? null}
          )
        `;
      }

      const release = event.release ?? "(unknown)";
      await transaction`
        INSERT INTO issue_releases (issue_id, release, quantity, first_seen, last_seen)
        VALUES (${issueId}, ${release}, 1, ${event.timestamp}, ${event.timestamp})
        ON CONFLICT (issue_id, release) DO UPDATE
        SET quantity = issue_releases.quantity + 1,
            first_seen = LEAST(issue_releases.first_seen, EXCLUDED.first_seen),
            last_seen = GREATEST(issue_releases.last_seen, EXCLUDED.last_seen)
      `;

      const sampleDecision = await transaction<Array<{ should_sample: boolean }>>`
        SELECT (
          (SELECT count(*) FROM issue_samples WHERE issue_id = ${issueId}) < 20
          OR NOT EXISTS (
            SELECT 1 FROM issue_samples
            WHERE issue_id = ${issueId} AND COALESCE(release, '(unknown)') = ${release}
          )
        ) AS should_sample
      `;
      if (sampleDecision[0]?.should_sample) {
        await transaction`
          DELETE FROM issue_samples
          WHERE id = (
            SELECT id FROM issue_samples
            WHERE issue_id = ${issueId}
            ORDER BY occurred_at ASC
            LIMIT 1
          )
          AND (SELECT count(*) FROM issue_samples WHERE issue_id = ${issueId}) >= 20
        `;
        await transaction`
          INSERT INTO issue_samples (
            id, issue_id, event_id, occurred_at, environment, release, platform, runtime,
            installation_id_hash, message, stack, breadcrumbs, context, tags
          ) VALUES (
            ${createIdentifier("sample")}, ${issueId}, ${event.eventId}, ${event.timestamp},
            ${event.environment}, ${event.release ?? null}, ${event.platform}, ${event.runtime},
            ${event.installationId ? sha256(event.installationId) : null}, ${event.error.message},
            ${event.error.stack ?? null}, ${transaction.json(event.breadcrumbs)},
            ${transaction.json(JSON.parse(JSON.stringify(event.context)))}, ${transaction.json(event.tags)}
          )
          ON CONFLICT (event_id) DO NOTHING
        `;
      }
    }
  });
}

export async function resolveIssue(issueId: string, fixedInRelease: string): Promise<boolean> {
  await ensureSchema();
  const sql = database();
  const rows = await sql<Array<{ id: string }>>`
    UPDATE issues
    SET status = 'resolved', fixed_in_release = ${fixedInRelease}, resolved_at = now(), updated_at = now()
    WHERE id = ${issueId}
    RETURNING id
  `;
  return rows.length === 1;
}

function isRegression(fixedRelease: string | null, incomingRelease: string | undefined): boolean {
  if (!fixedRelease || !incomingRelease) return true;
  const cleanFixed = semver.valid(semver.coerce(fixedRelease));
  const cleanIncoming = semver.valid(semver.coerce(incomingRelease));
  if (cleanFixed && cleanIncoming) return semver.gte(cleanIncoming, cleanFixed);
  return incomingRelease === fixedRelease;
}

function mapIssue(row: IssueRow): IssueSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    fingerprint: row.fingerprint,
    title: row.title,
    errorType: row.error_type,
    culprit: row.culprit,
    status: row.status,
    quantity: Number(row.quantity),
    firstSeen: row.first_seen.toISOString(),
    lastSeen: row.last_seen.toISOString(),
    latestRelease: row.latest_release,
    fixedInRelease: row.fixed_in_release,
  };
}
