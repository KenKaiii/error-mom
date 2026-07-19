# @kenkaiiii/error-mom

Automatic browser and Node.js error capture for a self-hosted [Error Mom](https://github.com/KenKaiii/error-mom) deployment.

## Install

```bash
npm install @kenkaiiii/error-mom
```

Create a project and generate framework-specific setup with the Error Mom CLI:

```bash
npm install --global error-mom
error-mom login https://errors.example.com --token "$ERROR_MOM_ADMIN_TOKEN"
error-mom init
```

`error-mom init` detects your framework and prints the exact wiring step for its official error hook. The generated project key is write-only and safe to ship; the admin token must stay private.

## Browser setup

```ts
import { initErrorMom } from "@kenkaiiii/error-mom";

export const errorMom = initErrorMom({
  server: "https://errors.example.com",
  projectKey: "em_ingest_...",
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_VERSION,
});
```

The browser entry point captures uncaught errors, unhandled rejections, `console.error`, failed requests, and up to 50 preceding breadcrumbs. Failed sends queue in local storage and retry without blocking the app.

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

The Node entry point captures uncaught errors, unhandled rejections, `console.error`, and failed requests. Events are written to a private JSONL spool under `~/.error-mom/spool` before upload so an outage or restart does not discard them.

Initialize the SDK separately in every process: browser UI, Electron main process, workers, sidecars, and server processes.

## Capture handled errors

```ts
try {
  await exportVideo();
} catch (error) {
  errorMom.captureError(error, {
    culprit: "video.export",
    tags: { job: "render" },
    context: { videoId },
  });
  throw error;
}
```

Wrap handlers that are caught by a framework, queue, webhook runner, or MCP host:

```ts
export const handler = errorMom.wrap(runJob, {
  culprit: "jobs.render-video",
});
```

Add application breadcrumbs when they help explain a later failure:

```ts
errorMom.addBreadcrumb({
  category: "checkout",
  level: "info",
  message: "Payment submitted",
  data: { provider: "stripe" },
});
```

Use `await errorMom.flush()` before a controlled shutdown. Call `dispose()` during teardown to restore patched global handlers.

## Options

| Option                  | Required  | Description                                                          |
| ----------------------- | --------- | -------------------------------------------------------------------- |
| `server`                | yes       | Base URL of your Error Mom deployment.                               |
| `projectKey`            | yes       | Write-only project ingest key. Safe to include in shipped clients.   |
| `environment`           | no        | Deployment environment; defaults to `production`.                    |
| `release`               | no        | App version used for regression detection and source maps.           |
| `tags`                  | no        | String tags attached to every event.                                 |
| `installationId`        | no        | Optional anonymous installation identifier. Only its hash is stored. |
| `captureConsoleErrors`  | no        | Capture `console.error`; defaults to `true`.                         |
| `captureFailedRequests` | no        | Capture failed requests; defaults to `true`.                         |
| `flushIntervalMs`       | no        | Retry interval; defaults to 5 seconds.                               |
| `maxQueueSize`          | no        | Browser default: 100. Node default: 1,000.                           |
| `spoolDirectory`        | Node only | Override the Node JSONL spool directory.                             |

## Automatic request capture

Network failures and HTTP 5xx responses are captured automatically. Errors from known AI providers are named and tagged by provider; provider 4xx responses are captured as well.

## Privacy and safety

Capture and upload failures never throw into the host application. Before sending, the SDK recursively scrubs secret-keyed fields, emails, query credentials, URL userinfo, Telegram bot tokens, Discord and Slack webhook credentials, and explicitly labeled credential path segments such as `/token/<value>` and `/api-key/<value>`. The collector repeats redaction before persistence.

## Source maps and verification

For minified production builds, report a `release`, enable source maps, and upload them after the build:

```bash
error-mom sourcemaps <build-directory> --release <app-version> --project <project-slug>
error-mom doctor --symbolication
```

Source-map upload requires the private admin token. Ingest keys cannot upload or read data.

See the [repository README](https://github.com/KenKaiii/error-mom#readme) for deployment, framework setup, dashboard, CLI, and MCP instructions.
