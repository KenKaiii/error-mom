# @kenkaiiii/error-mom-protocol

Shared Zod schemas, TypeScript types, and credential redaction used by Error Mom collectors and SDKs. Most applications should install [`@kenkaiiii/error-mom`](https://www.npmjs.com/package/@kenkaiiii/error-mom) instead.

## Install

```bash
npm install @kenkaiiii/error-mom-protocol
```

## Validate event batches

```ts
import { eventBatchSchema } from "@kenkaiiii/error-mom-protocol";

const result = eventBatchSchema.safeParse(input);
if (!result.success) {
  console.error(result.error.issues);
}
```

Exported schemas:

- `breadcrumbSchema`
- `errorEventSchema`
- `eventBatchSchema`

Exported types:

- `Breadcrumb`
- `ErrorEvent`
- `EventBatch`
- `ProjectSummary`
- `IssueStatus` (`observed`, `open`, `regressed`, or `resolved`)
- `IssueSummary`
- `IssueSample`
- `IssueDetail`

## Redact credentials in text

```ts
import { redactStringCredentials } from "@kenkaiiii/error-mom-protocol";

const safeMessage = redactStringCredentials(unsafeMessage);
```

The helper preserves useful route context while redacting emails, query credentials, URL userinfo, Telegram bot tokens, Discord and Slack webhook credentials, and explicitly labeled credential paths such as `/token/<value>` and `/api-key/<value>`.

Object traversal and secret-key detection belong in the SDK or collector; this helper handles one string.

See the [repository README](https://github.com/KenKaiii/error-mom#readme) for deployment, SDK, CLI, MCP, and security instructions.
