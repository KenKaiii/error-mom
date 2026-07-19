import { describe, expect, it } from "vitest";
import { redact } from "./security";

describe("redact", () => {
  it("recursively redacts URL credentials from every event-shaped field", () => {
    const telegram = ["123456", "SERVER_SENTINEL"].join(":");
    const userinfo = ["service-user", "userinfo-sentinel"].join(":");
    const sentinels = [
      telegram,
      userinfo,
      "tag-sentinel",
      "context-sentinel",
      "discord-sentinel",
      "slack-sentinel",
      "query-sentinel",
    ];
    const unsafe = {
      message: `POST https://api.telegram.org/bot${telegram}/sendMessage returned 500`,
      stack: `Error at https://${userinfo}@example.com/jobs/42`,
      tags: { endpoint: "https://example.com/token/tag-sentinel/resource" },
      context: {
        request: {
          url: "https://example.com/access_token/context-sentinel/run",
          authorization: "Bearer header-value",
        },
      },
      breadcrumbs: [
        {
          message: "POST https://discord.com/api/webhooks/123/discord-sentinel failed",
          data: {
            url: "https://hooks.slack.com/services/T000/B000/slack-sentinel",
            retry: "https://example.com/run?api_key=query-sentinel&safe=true",
          },
        },
      ],
    };

    const redacted = redact(unsafe) as typeof unsafe;
    const serialized = JSON.stringify(redacted);

    for (const sentinel of sentinels) expect(serialized).not.toContain(sentinel);
    expect(redacted.message).toContain("api.telegram.org/bot[REDACTED]/sendMessage");
    expect(redacted.stack).toContain("example.com/jobs/42");
    expect(redacted.tags.endpoint).toContain("/token/[REDACTED]/resource");
    expect(redacted.context.request.authorization).toBe("[REDACTED]");
    expect(redacted.breadcrumbs).toHaveLength(1);
    expect(redacted.breadcrumbs[0]?.data.retry).toContain("safe=true");
  });

  it("preserves bounded structure and ordinary resource identifiers", () => {
    const value = {
      route: "https://example.com/projects/project_123/issues/issue_456",
      nested: [{ count: 2, active: true }],
    };

    expect(redact(value)).toEqual(value);
  });
});
