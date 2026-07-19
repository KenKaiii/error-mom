# Error Mom

Self-hosted error monitoring built for coding agents and humans. One deployment receives errors from every app you control, groups repeats into counted issues, keeps representative evidence, and hides resolved work from the default agent queue.

## What ships

- `apps/web`: Next.js dashboard, ingestion API, agent API, authentication, and automatic PostgreSQL schema setup.
- `packages/sdk`: automatic browser and Node.js capture with redaction, breadcrumbs, retries, and durable queues.
- `packages/cli`: project setup, diagnostics, issue operations, and a local MCP stdio server.
- `packages/protocol`: the validated event contract shared by collectors and SDKs.

## Run locally

```bash
cp .env.example apps/web/.env.local
# Replace ERROR_MOM_ADMIN_TOKEN with at least 32 random characters.
docker compose up -d
pnpm install
pnpm db:seed # optional: 3 projects and 9 realistic issues
pnpm dev
```

Open `http://localhost:3000` and enter the admin token. Create a project to receive its write-only ingest key once.

## Deploy to Railway

With the [Railway CLI](https://docs.railway.com/guides/cli) installed and logged in:

```bash
railway init --name error-mom
railway add --database postgres
railway add --service error-mom \
  --variables 'DATABASE_URL=${{Postgres.DATABASE_URL}}' \
  --variables "ERROR_MOM_ADMIN_TOKEN=$(openssl rand -hex 32)"
railway up --service error-mom
railway domain --service error-mom
```

That is the whole deployment. `railway.json` and `Dockerfile` provide the build, `/api/health` health check, and production server configuration. The schema is created automatically on first boot, and TLS is auto-disabled on Railway private networking (`*.railway.internal`). Save the generated `ERROR_MOM_ADMIN_TOKEN` — it is the dashboard login and agent credential.

Prefer the dashboard? Create a project from your GitHub fork, add the PostgreSQL plugin, and set the same two variables on the web service. Each user deploys one private Error Mom instance and creates as many app projects as needed inside it.

## Connect an app (the whole process)

You deployed Error Mom once. Now, for each app you want monitored, open that app with your coding agent and have it run:

```bash
npm install --global error-mom
error-mom login https://your-error-mom.up.railway.app --token "$ERROR_MOM_ADMIN_TOKEN"   # once per machine
error-mom init
```

`error-mom init` does the whole hookup in one shot:

1. Creates a project on your deployment named after the app's `package.json` (or reuses a matching one).
2. Mints the project's write-only ingest key and appends it with the server URL to the app's env file.
3. Detects the framework and package manager, installs `@kenkaiiii/error-mom`, and writes a ready-made setup file (for example `src/error-mom.ts`).
4. Prints JSON with the one remaining step: import the setup file from the app's earliest entry point.

Then prove the pipeline end to end:

```bash
error-mom doctor --project-key <key>
```

Doctor pushes a synthetic event through auth, validation, and rate limiting. It is counted in the response (`"synthetic": 1`) but never stored as an issue, so your queue only ever contains real errors.

From that moment every uncaught error, unhandled rejection, `console.error`, and failed request flows to your dashboard, grouped by fingerprint with repeat counts. Watch them three ways:

- **Dashboard**: your deployment URL, signed in with the admin token.
- **CLI**: `error-mom issues`, `error-mom inspect <id>`, `error-mom resolve <id> --release <version>`.
- **MCP**: your coding agent queries and resolves issues itself — see the MCP config below.

Monorepo note: `init` shells out to npm for the install. In pnpm or yarn workspaces run `error-mom init --skip-install`, then add the SDK with your own tool (for example `pnpm --filter <app> add @kenkaiiii/error-mom`).

## Browser setup

```bash
pnpm add @kenkaiiii/error-mom
```

```ts
import { initErrorMom } from "@kenkaiiii/error-mom";

export const errorMom = initErrorMom({
  server: import.meta.env.VITE_ERROR_MOM_SERVER,
  projectKey: import.meta.env.VITE_ERROR_MOM_PROJECT_KEY,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_VERSION,
});
```

The browser adapter captures uncaught errors, unhandled rejections, `console.error`, failed network requests, and the 50 breadcrumbs preceding a failure. Events queue in local storage and retry without blocking the app.

## Node.js setup

```ts
import { initErrorMom } from "@kenkaiiii/error-mom/node";

export const errorMom = initErrorMom({
  server: process.env.ERROR_MOM_SERVER!,
  projectKey: process.env.ERROR_MOM_PROJECT_KEY!,
  environment: process.env.NODE_ENV,
  release: process.env.APP_VERSION,
});
```

Node events append to `~/.error-mom/spool/*.jsonl` before upload. A network or collector outage cannot discard queued errors.

## Agent and CLI setup

```bash
npm install --global error-mom
error-mom login https://your-error-mom.up.railway.app --token "$ERROR_MOM_ADMIN_TOKEN"
error-mom projects
error-mom issues
error-mom inspect issue_123
error-mom resolve issue_123 --release 1.4.2
```

Add Error Mom to an MCP-capable coding agent:

```json
{
  "mcpServers": {
    "error-mom": {
      "command": "error-mom",
      "args": ["mcp"]
    }
  }
}
```

MCP tools:

- `list_projects`
- `list_issues` (unresolved by default)
- `get_issue`
- `resolve_issue`

## Issue lifecycle

Events are normalized and fingerprinted from the error type, message shape, and top stack frames. A repeated fingerprint increments `quantity` instead of creating duplicate rows. Resolving records `fixedInRelease`; recurrence in that or a later semantic release reopens the issue as `regressed`. Raw history remains available while resolved issues stay out of the agent's default context.

## Security model

- Project ingest keys are write-only, hashed in PostgreSQL, and shown once.
- The dashboard and read/write agent API use a separate private admin token.
- Known password, token, cookie, authorization, API-key, URL-secret, and email fields are redacted in both SDK and collector.
- Browser ingest allows cross-origin writes because shipped browser keys are public by nature; those keys cannot read or resolve issues.
- `.env.local`, local queues, and agent credentials are excluded from Git.

## Verification

```bash
pnpm check
pnpm test
pnpm build
pnpm format:check
```

## License

MIT
