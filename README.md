# 👩‍🔧 Error Mom

<p align="center">
  <img src="docs/error-mom-icon.png" alt="Error Mom" width="200">
</p>

<p align="center">
  <strong>Your apps crash. Mom finds out. Your coding agent fixes it.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <a href="https://youtube.com/@kenkaidoesai"><img src="https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="YouTube"></a>
  <a href="https://skool.com/kenkai"><img src="https://img.shields.io/badge/Skool-Community-7C3AED?style=for-the-badge" alt="Skool"></a>
</p>

**Error Mom** is your own private error tracker. Every app you build reports its crashes to one dashboard, and your coding agent reads those errors and fixes them for you.

No Sentry subscription, no per-seat pricing, no data on someone else's cloud. One deployment, all your apps, and setup is three copy-paste prompts. You don't need to understand any of the code here.

---

## ✨ What it does

### One dashboard for every app

Deploy Error Mom once. Connect as many of your apps as you want. Each gets its own write-only key, and every crash lands in the same queue.

### Your coding agent fixes the errors

The `error-mom` CLI and built-in MCP server let Claude Code, Cursor, or GG Coder list your unresolved issues, read the stack traces and breadcrumbs, fix the code, and mark issues resolved, all from one prompt.

### Repeats are counted, not duplicated

The same crash happening 500 times shows as **one** issue with a count of 500, plus a few representative samples. Your queue stays readable.

### Fixed means fixed, until it isn't

Resolving an issue records the release that fixed it. If the same error comes back in that release or a newer one, the issue automatically reopens as **regressed**.

### Secrets never land in the database

Passwords, tokens, cookies, authorization headers, and API keys are scrubbed twice: in the SDK before sending and in the collector before storing.

### AI provider failures are labeled automatically

A failed call to Anthropic, OpenAI, Kimi, GLM, Qwen, Groq, OpenRouter, or ~40 other AI APIs shows up as its own named issue (like `AnthropicApiError`) tagged with provider and status code. "Anthropic is down" and "my code is broken" never blur together.

### Tracking can never break your app

Capture never throws into your code. Offline? Browser events queue in local storage, Node events spool to disk, and everything retries later.

---

## 🆚 Error Mom vs Sentry

|           | **Error Mom**                                             | **Sentry**                                           |
| --------- | --------------------------------------------------------- | ---------------------------------------------------- |
| Cost      | ~$5/month total on Railway, unlimited apps                | Free tier, then from $26/month, priced per event     |
| Data      | Your server, your Postgres                                | Their cloud (self-host exists but is heavy to run)   |
| Built for | Coding agents: CLI + MCP so the agent fixes errors itself | Human dashboards, alerting, big-team workflows       |
| Setup     | Three copy-paste prompts                                  | SDK config, DSNs, project settings per app           |
| Scope     | Errors in, grouped issues out. On purpose.                | Tracing, profiling, session replay, cron monitoring… |
| Source    | Open source (MIT), read every line                        | Open core (FSL)                                      |

If you need tracing, replay, and a big-team workflow, Sentry is a great product. If you want your own private error queue that your coding agent works through, this is a lot simpler and it's yours.

---

## ☁️ What you need first

- A [Railway](https://railway.com) account (this is where Error Mom runs, ~$5/month for the database and server).
- A coding agent (Claude Code, Cursor, GG Coder, etc.).

That's it. You never run Docker, never touch a database, never write config.

## 🚀 Prompt 1: Set up Error Mom (do this once, ever)

Paste this into your coding agent:

```text
Set up Error Mom, my private error tracker, on Railway.

1. If the Railway CLI is not installed, install it (npm install -g @railway/cli
   or brew install railway). If I am not logged in, run "railway login" and
   wait for me to finish the browser login.
2. Clone https://github.com/KenKaiii/error-mom and from inside that folder run:
   railway init --name error-mom
   railway add --database postgres
   railway add --service error-mom \
     --variables 'DATABASE_URL=${{Postgres.DATABASE_URL}}' \
     --variables "ERROR_MOM_ADMIN_TOKEN=$(openssl rand -hex 32)"
   railway up --service error-mom --ci
   railway domain --service error-mom
3. Do NOT run any migrations or extra setup. The database configures itself
   on first boot.
4. Verify it works: keep checking <the printed domain>/api/health until it
   returns {"status":"ok"} (first boot can take a minute).
5. Then tell me, clearly:
   - My dashboard URL
   - My admin token (the ERROR_MOM_ADMIN_TOKEN value you generated)
   - That I should save both somewhere safe, like a password manager.
   Never commit the token to git.
```

When it's done, open the dashboard URL in your browser and log in with the admin token. Empty queue = working.

## 🔌 Prompt 2: Add error tracking to one of your apps

Do this once per app. Open the app in your coding agent, fill in the two placeholders, and paste:

```text
Add error tracking to this app using my private Error Mom server.

My server: https://MY-ERROR-MOM.up.railway.app
My admin token: MY_ADMIN_TOKEN

1. Install the CLI and log in:
   npm install --global error-mom
   error-mom login <my server> --token <my admin token>
2. From this app's folder run: error-mom init
   (if this is a pnpm or yarn workspace, run: error-mom init --skip-install,
   then install @kenkaiiii/error-mom into the app with the workspace's own
   package manager)
3. init detects the framework (Next.js, Vite, Tauri, Electron, Astro,
   SvelteKit, Nuxt, Remix, Angular, Express, Fastify, Hono, NestJS, or
   plain Node) and generates a setup file. Its JSON output includes a
   "wiring" field with exact instructions for THIS framework's official
   error hook. Follow them precisely.
   The setup file has the write-only project key baked in on purpose (the
   Sentry DSN model): it can only submit errors, never read them, so it is
   safe to commit, and production/CI builds report with zero extra config.
   (On Next.js apps init also generates instrumentation.ts, which reports
   server-side errors: API routes, SSR, server actions. Keep it.)
4. Cover every process and every catch site:
   - If the app has MULTIPLE processes (Electron main + renderer, Tauri
     webview + Node sidecars, worker processes), initialize the SDK in
     EACH one; the browser build for UI processes, @kenkaiiii/error-mom/node
     for Node processes. One process covered is not covered.
   - If the app funnels caught errors through a central handler or
     error-broadcast function, call errorMom.captureError(err) inside it.
   - Wrap handlers where a framework catches errors itself (queue/cron
     jobs like Inngest, webhook routes, MCP tools):
     errorMom.wrap(handlerFn, { culprit: "<job or route name>" }).
   Failed calls to AI providers (Anthropic, OpenAI, Kimi, GLM, and ~40
   more) are captured and tagged automatically in every covered process.
5. Prove it works end to end by running the exact doctor command init
   printed in its nextAction output.
   Success = the response shows "accepted": 1 and "synthetic": 1. Doctor's
   test event is never shown as a real error, so my dashboard stays clean.
6. Commit the changes and confirm to me it's all connected. The baked
   project key is safe to commit (write-only), but my ADMIN token must
   never appear in git; check before committing.
```

From now on, every crash in that app shows up on your dashboard automatically: grouped, counted, with the story of what happened right before.

<details>
<summary><strong>Already connected an app before? Prompt to upgrade it</strong></summary>

```text
Update this app's Error Mom integration to the latest version.

1. Upgrade @kenkaiiii/error-mom to the latest version with this project's
   package manager, and update the CLI: npm install -g error-mom
2. Re-run: error-mom init --skip-install
   It reuses the existing project, regenerates the setup file with the
   write-only project key baked in (so production/CI builds report without
   env configuration), and on Next.js adds instrumentation.ts for
   server-side errors. Re-apply any customizations the old setup file had.
3. Audit coverage, then fix every gap:
   - Every process initializes the SDK (UI processes use the browser
     build, Node processes/sidecars/workers use @kenkaiiii/error-mom/node).
   - Any central error handler or error-broadcast function calls
     errorMom.captureError(err).
   - Handlers where a framework catches errors itself (queue/cron jobs,
     webhook routes, MCP tools) are wrapped with
     errorMom.wrap(fn, { culprit: "<name>" }).
4. Verify with error-mom doctor, confirm the admin token is not in git
   (the baked project key is fine, it is write-only), commit.
```

</details>

## 🔧 Prompt 3: Get your agent to fix the errors

Whenever you want, paste this into the coding agent for any connected app:

```text
Connect to my Error Mom and fix my errors.

My server: https://MY-ERROR-MOM.up.railway.app
My admin token: MY_ADMIN_TOKEN

1. Make sure the error-mom CLI is installed and logged in
   (npm install -g error-mom, then error-mom login <server> --token <token>).
2. Run: error-mom issues
3. For each unresolved issue in THIS app, run error-mom inspect <id> to see
   the stack trace and the steps that led to it, find the cause in the code,
   and fix it.
4. After a fix ships, mark it done with:
   error-mom resolve <id> --release <the app version containing the fix>
5. Tell me what was broken and what you fixed, in plain words.
```

Prefer your agent to have this always available? Add Error Mom as an MCP server and it gets `list_issues`, `get_issue`, and `resolve_issue` as built-in tools:

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

## 📊 How you see your errors

- **Dashboard**: your Railway URL, log in with the admin token. Shows every unresolved error, newest first, with counts.
- **Ask your agent**: "check error mom" once it's logged in or connected via MCP.

Nice things you don't have to think about:

- The same crash happening 500 times shows as **one** issue with a count of 500.
- Passwords, tokens, and API keys are scrubbed before anything is stored.
- Fixed issues disappear from the default view; if a "fixed" bug comes back in a newer version it automatically reopens as **regressed**.
- If your app is offline, errors queue up locally and send later. Tracking can never crash or slow the app.

---

## 👥 Community

- **YouTube**: [@kenkaidoesai](https://youtube.com/@kenkaidoesai) for tutorials and demos
- **Skool**: [skool.com/kenkai](https://skool.com/kenkai), come hang out

---

## 🛠️ For developers

<details>
<summary>Repo layout, local dev, and manual setup</summary>

### What ships

- `apps/web`: Next.js dashboard, ingestion API, agent API, authentication, automatic PostgreSQL schema setup.
- `packages/sdk` (`@kenkaiiii/error-mom`): automatic browser and Node.js capture with redaction, breadcrumbs, retries, durable queues.
- `packages/cli` (`error-mom`): project setup, diagnostics, issue operations, MCP stdio server.
- `packages/protocol`: the validated event contract shared by collectors and SDKs.

### Run locally

```bash
cp .env.example apps/web/.env.local
# Replace ERROR_MOM_ADMIN_TOKEN with at least 32 random characters.
docker compose up -d
pnpm install
pnpm db:seed # optional: 3 projects and 9 realistic issues
pnpm dev
```

Open `http://localhost:3000` and enter the admin token.

### Manual SDK setup

Browser (Vite shown):

```ts
import { initErrorMom } from "@kenkaiiii/error-mom";

export const errorMom = initErrorMom({
  server: import.meta.env.VITE_ERROR_MOM_SERVER,
  projectKey: import.meta.env.VITE_ERROR_MOM_PROJECT_KEY,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_VERSION,
});
```

Captures uncaught errors, unhandled rejections, `console.error`, failed network requests, and the 50 breadcrumbs preceding a failure. Events queue in local storage and retry without blocking the app.

Node:

```ts
import { initErrorMom } from "@kenkaiiii/error-mom/node";

export const errorMom = initErrorMom({
  server: process.env.ERROR_MOM_SERVER!,
  projectKey: process.env.ERROR_MOM_PROJECT_KEY!,
  environment: process.env.NODE_ENV,
  release: process.env.APP_VERSION,
});
```

Node events append to `~/.error-mom/spool/*.jsonl` before upload; an outage cannot discard queued errors.

### CLI

```bash
error-mom projects
error-mom issues
error-mom inspect issue_123
error-mom resolve issue_123 --release 1.4.2
error-mom doctor --project-key em_ingest_...
```

### Issue lifecycle

Events are normalized and fingerprinted from the error type, message shape, and top stack frames. A repeated fingerprint increments `quantity` instead of creating duplicate rows. Resolving records `fixedInRelease`; recurrence in that or a later semantic release reopens the issue as `regressed`.

### Security model

- Project ingest keys are write-only, hashed in PostgreSQL, and shown once.
- The dashboard and read/write agent API use a separate private admin token.
- Known password, token, cookie, authorization, API-key, URL-secret, and email fields are redacted in both SDK and collector.
- Browser ingest allows cross-origin writes because shipped browser keys are public by nature; those keys cannot read or resolve issues.
- Doctor synthetic events are validated and rate-checked but never persisted as issues.

### Verification

```bash
pnpm check
pnpm test
pnpm build
pnpm format:check
```

</details>

## 📄 License

MIT

---

<p align="center">
  <strong>Crash in, fix out. Mom's got you. 👩‍🔧</strong>
</p>
