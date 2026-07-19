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

## Step 1: Deploy Error Mom (paste this prompt into your coding agent)

One-time setup. Requires the [Railway CLI](https://docs.railway.com/guides/cli) installed and logged in (`railway login`). Paste this to your agent:

```text
Deploy Error Mom (self-hosted error monitoring) to Railway for me.

1. Run these commands:
   railway init --name error-mom
   railway add --database postgres
   railway add --service error-mom \
     --variables 'DATABASE_URL=${{Postgres.DATABASE_URL}}' \
     --variables "ERROR_MOM_ADMIN_TOKEN=$(openssl rand -hex 32)"
   railway up --service error-mom --ci
   railway domain --service error-mom
2. The deploy builds from the Dockerfile automatically; the database schema
   creates itself on first boot. Do not run migrations manually.
3. Verify: curl the printed domain at /api/health until it returns
   {"status":"ok"} (allow ~60s for the first boot).
4. Save the generated ERROR_MOM_ADMIN_TOKEN somewhere safe outside git and
   tell me the dashboard URL and where you saved the token. That token is my
   dashboard login and agent credential — never commit it.
```

No Docker needed on your machine — Railway builds the image. Prefer clicking? Create a Railway project from your GitHub fork, add the PostgreSQL plugin, and set `DATABASE_URL` + `ERROR_MOM_ADMIN_TOKEN` on the web service.

## Step 2: Add error tracking to an app (paste this prompt into your coding agent)

Repeat for each app you want monitored. Open the app with your coding agent, replace the URL and token placeholders, and paste:

```text
Hook this app up to my self-hosted Error Mom for error tracking.

Server: https://YOUR-ERROR-MOM.up.railway.app
Admin token: YOUR_ADMIN_TOKEN

1. Install the CLI and authenticate:
   npm install --global error-mom
   error-mom login <server> --token <admin token>
2. From this app's directory run: error-mom init
   (in a pnpm/yarn workspace use: error-mom init --skip-install, then add
   @kenkaiiii/error-mom to the app with the workspace's package manager)
3. init creates the project, writes the ingest key to the env file, and
   generates a setup file (for example src/error-mom.ts). Import that setup
   file from the app's EARLIEST entry point so startup errors are captured.
   Guard the init call so missing env vars skip monitoring instead of
   throwing — capture must never crash the app.
4. Verify end to end: error-mom doctor --project-key <key from the env file>
   Success looks like "accepted": 1 with "synthetic": 1 — doctor events are
   never stored as issues, so the queue stays clean.
5. Confirm the ingest key stayed out of git (it belongs in a gitignored env
   file), then commit the setup changes.
```

After that, every uncaught error, unhandled rejection, `console.error`, and failed request flows to your dashboard, grouped by fingerprint with repeat counts. Watch them three ways:

- **Dashboard**: your deployment URL, signed in with the admin token.
- **CLI**: `error-mom issues`, `error-mom inspect <id>`, `error-mom resolve <id> --release <version>`.
- **MCP**: your coding agent queries and resolves issues itself — see the MCP config below.

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
