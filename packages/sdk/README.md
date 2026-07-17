# @kenkaiiii/error-mom

Automatic browser and Node.js error capture for a self-hosted Error Mom deployment.

```ts
import { initErrorMom } from "@kenkaiiii/error-mom";

initErrorMom({
  server: "https://errors.example.com",
  projectKey: "em_ingest_...",
  release: "1.0.0",
});
```

Use `@kenkaiiii/error-mom/node` for Node.js. The browser adapter retries through local storage; the Node adapter writes a private JSONL spool before upload.

See the repository README for framework setup, privacy controls, and deployment instructions.
