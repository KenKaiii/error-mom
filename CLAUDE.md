# Error Mom

Self-hosted, agent-first error monitoring. One deployment serves many projects; shipped apps receive write-only ingest keys, while dashboards and coding agents use one private admin token.

## Structure

- `apps/web`: Next.js dashboard and HTTP API backed by PostgreSQL.
- `packages/protocol`: Zod event schemas and public API types.
- `packages/sdk`: browser entry point and `./node` entry point.
- `packages/cli`: JSON CLI plus MCP stdio server.

## Commands

```bash
pnpm check
pnpm test
pnpm build
pnpm format:check
pnpm dev
```

Set `TEST_DATABASE_URL` to run the PostgreSQL integration test. CI always runs it against PostgreSQL 17.

## Invariants

- Ingest keys only write events. They must never read projects or issues.
- Admin tokens are required for every dashboard and agent API operation.
- Store only hashes of ingest keys and installation IDs.
- Redact known secrets before persistence, even when SDKs already redacted them.
- Event retries are idempotent through `(project_id, event_id)` receipts.
- Group events by project and normalized fingerprint; increment quantity instead of retaining every event.
- Keep at most representative samples per issue and query unresolved issues by default.
- Resolving requires `fixedInRelease`; matching or later recurrence becomes `regressed`.
- Browser and Node capture must never throw into or block the host app.
- Node capture writes JSONL before upload; browser capture queues in local storage.
- New agent operations belong in both the HTTP API and MCP/CLI when applicable.
