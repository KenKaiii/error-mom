# error-mom

Agent-first CLI and MCP tools for a self-hosted Error Mom incident desk.

```bash
npm install --global error-mom
error-mom login https://errors.example.com --token "$ERROR_MOM_ADMIN_TOKEN"
error-mom projects
error-mom issues
error-mom inspect <issue-id>
error-mom resolve <issue-id> --release 1.4.2
```

Run `error-mom mcp` as a stdio MCP server. It exposes `list_projects`, `list_issues`, `get_issue`, and `resolve_issue`.
