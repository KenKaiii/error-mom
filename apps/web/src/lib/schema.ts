export const DATABASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  ingest_key_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_ingest_keys (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ingest_key_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_ingest_keys_project_idx ON project_ingest_keys(project_id);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS event_receipts (
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, event_id)
);
CREATE INDEX IF NOT EXISTS event_receipts_received_idx ON event_receipts(received_at);

CREATE TABLE IF NOT EXISTS ingest_rate_limits (
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  event_count integer NOT NULL,
  PRIMARY KEY(project_id, window_start)
);
CREATE INDEX IF NOT EXISTS ingest_rate_limits_window_idx ON ingest_rate_limits(window_start);

CREATE TABLE IF NOT EXISTS issues (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  title text NOT NULL,
  error_type text NOT NULL,
  culprit text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('observed', 'open', 'regressed', 'resolved')),
  quantity bigint NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL,
  last_seen timestamptz NOT NULL,
  latest_release text,
  fixed_in_release text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, fingerprint)
);

ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_status_check;
ALTER TABLE issues ADD CONSTRAINT issues_status_check
  CHECK (status IN ('observed', 'open', 'regressed', 'resolved'));

CREATE INDEX IF NOT EXISTS issues_project_status_last_seen_idx
  ON issues(project_id, status, last_seen DESC);
CREATE INDEX IF NOT EXISTS issues_status_last_seen_idx
  ON issues(status, last_seen DESC);

CREATE TABLE IF NOT EXISTS issue_samples (
  id text PRIMARY KEY,
  issue_id text NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  event_id text NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL,
  environment text NOT NULL,
  release text,
  platform text NOT NULL,
  runtime text NOT NULL,
  installation_id_hash text,
  message text NOT NULL,
  stack text,
  breadcrumbs jsonb NOT NULL DEFAULT '[]'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issue_samples_issue_occurred_idx
  ON issue_samples(issue_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS issue_releases (
  issue_id text NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  release text NOT NULL,
  quantity bigint NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL,
  last_seen timestamptz NOT NULL,
  PRIMARY KEY(issue_id, release)
);

CREATE TABLE IF NOT EXISTS release_sourcemaps (
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  release text NOT NULL,
  file_name text NOT NULL,
  map jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, release, file_name)
);
CREATE INDEX IF NOT EXISTS release_sourcemaps_project_release_idx
  ON release_sourcemaps(project_id, release);
`;
