# Error Mom

Self-hosted, agent-first error monitoring. One deployment serves many projects; shipped apps receive write-only ingest keys, while dashboards and coding agents use one private admin token.

## Structure

- `apps/web` (`error-mom-web`): Next.js dashboard and HTTP API (`/api/v1/*`) backed by PostgreSQL.
- `packages/protocol` (`@kenkaiiii/error-mom-protocol`): Zod event schemas and public API types. Must be built before dependents typecheck (`pnpm check` handles this).
- `packages/sdk` (`@kenkaiiii/error-mom`): browser entry point and `./node` entry point.
- `packages/cli` (bin `error-mom`): JSON CLI plus MCP stdio server (`error-mom mcp`).

## Commands

pnpm 10 monorepo, Node >= 22.

```bash
pnpm check         # builds packages/protocol first, then typechecks all workspaces
pnpm test          # vitest across workspaces
pnpm build
pnpm format:check  # prettier
pnpm dev           # apps/web only
pnpm db:migrate
pnpm db:seed
```

Set `TEST_DATABASE_URL` to run the PostgreSQL integration test. CI always runs it against PostgreSQL 17. The web app also needs `DATABASE_URL` and `ERROR_MOM_ADMIN_TOKEN` (32+ chars).

No migration tool: the full idempotent DDL lives in `apps/web/src/lib/schema.ts`; `pnpm db:migrate` applies it via `ensureSchema()` under an advisory lock. Integration tests in `apps/web` run serially (`fileParallelism: false`) because they share one database.

## Invariants

- Ingest keys only write events. They must never read projects or issues.
- Admin tokens are required for every dashboard and agent API operation.
- Source map upload (`/api/v1/sourcemaps`) and symbolication checks (`/api/v1/sourcemaps/check`) are admin-token operations; ingest keys are rejected.
- Store only hashes of ingest keys and installation IDs.
- Redact known secrets before persistence, even when SDKs already redacted them.
- Event retries are idempotent through `(project_id, event_id)` receipts.
- Group events by project and normalized fingerprint; increment quantity instead of retaining every event.
- Keep at most representative samples per issue and query unresolved issues by default.
- Resolving requires `fixedInRelease`; matching or later recurrence becomes `regressed`.
- Doctor synthetic events (`ErrorMomDoctor` + `synthetic` tag) are validated and rate-checked but never persisted as issues.
- Browser and Node capture must never throw into or block the host app.
- Node capture writes JSONL before upload; browser capture queues in local storage.
- New agent operations belong in both the HTTP API and MCP/CLI when applicable.
