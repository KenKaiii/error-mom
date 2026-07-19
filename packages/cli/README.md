# error-mom

Agent-first CLI and MCP tools for a self-hosted [Error Mom](https://github.com/KenKaiii/error-mom) deployment.

## Install and authenticate

```bash
npm install --global error-mom
error-mom login https://errors.example.com --token "$ERROR_MOM_ADMIN_TOKEN"
```

Login stores the server URL and private admin token in `~/.error-mom/config.json` with private file permissions. You can instead set `ERROR_MOM_SERVER` and `ERROR_MOM_ADMIN_TOKEN`.

## Connect an app

Run this from the app you want to monitor:

```bash
error-mom init
```

`init` creates or reuses a project, installs `@kenkaiiii/error-mom`, generates a setup file, detects the framework, and returns exact wiring instructions. For a pnpm or Yarn workspace, use `error-mom init --skip-install` and install the SDK with the workspace package manager.

The generated project key is write-only and safe to commit or ship. It can submit events but cannot read issues, manage projects, or upload source maps. Keep the admin token private.

Verify health and ingestion with the exact `error-mom doctor --project-key ...` command printed by `init`. Synthetic doctor events are validated but never stored as issues.

## Work with projects and issues

```bash
error-mom projects
error-mom issues
error-mom issues --project <project-id>
error-mom inspect <issue-id>
error-mom inspect <issue-id> --samples 5
error-mom resolve <issue-id> --release 1.4.2
```

Resolved issues stay hidden by default. If the same issue returns in the fixed release or a newer release, Error Mom marks it as regressed.

Permanently deleting a project also deletes its issues, samples, ingest keys, and receipts:

```bash
error-mom delete-project <project-id>
```

## Source maps

Upload source maps immediately after a production build. The release must exactly match the release reported by the SDK.

```bash
error-mom sourcemaps <build-directory> \
  --release <app-version> \
  --project <project-slug>
```

The command discovers JavaScript/source-map pairs and warns about missing `sourcesContent` or release mismatches. Uploads require the admin token; project ingest keys are rejected.

Test symbolication without storing an event or map:

```bash
error-mom doctor --symbolication
```

## MCP server

Run `error-mom mcp` as a stdio MCP server. It exposes:

- `list_projects`
- `list_issues`
- `get_issue`
- `resolve_issue`
- `check_symbolication`
- `delete_project`

Example client configuration:

```json
{
  "mcpServers": {
    "error-mom": {
      "command": "error-mom",
      "args": ["mcp"],
      "env": {
        "ERROR_MOM_SERVER": "https://errors.example.com",
        "ERROR_MOM_ADMIN_TOKEN": "set-this-in-your-secret-store"
      }
    }
  }
}
```

Prefer your MCP client's secure environment or secret configuration instead of committing the admin token.

## Command help

```bash
error-mom --help
error-mom <command> --help
```

Operational commands write machine-readable JSON to stdout, making the CLI suitable for coding agents and automation.

See the [repository README](https://github.com/KenKaiii/error-mom#readme) for deployment, SDK, framework, dashboard, and security instructions.
