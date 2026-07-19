import { describe, expect, it } from "vitest";
import { eventBatchSchema, redactStringCredentials } from "./index";

const validEvent = {
  eventId: "2f0e7d9e-c16c-4a9c-ae1a-01d9a110a2cf",
  timestamp: "2026-07-18T12:00:00.000Z",
  level: "error",
  error: { name: "TypeError", message: "Render failed" },
  environment: "production",
  platform: "macOS",
  runtime: "browser",
  breadcrumbs: [],
  tags: {},
  context: {},
};

describe("eventBatchSchema", () => {
  it("accepts a bounded valid event batch", () => {
    expect(
      eventBatchSchema.safeParse({ events: [validEvent], sdk: { name: "test", version: "1.0.0" } })
        .success,
    ).toBe(true);
  });

  it("rejects oversized batches", () => {
    expect(
      eventBatchSchema.safeParse({
        events: Array.from({ length: 101 }, () => validEvent),
        sdk: { name: "test", version: "1.0.0" },
      }).success,
    ).toBe(false);
  });
});

describe("redactStringCredentials", () => {
  const userinfo = ["alice", "sample-pass"].join(":");
  const telegramToken = ["123456", "ABC_def-GHI"].join(":");
  const email = ["dev", "example.com"].join("@");
  const credentialCases = [
    {
      input: `POST https://${userinfo}@example.com/orders/42 returned 401`,
      sentinel: userinfo,
      preserved: ["example.com/orders/42", "POST", "401"],
    },
    {
      input: `GET https://api.telegram.org/bot${telegramToken}/sendMessage returned 500`,
      sentinel: telegramToken,
      preserved: ["api.telegram.org", "/sendMessage", "GET", "500"],
    },
    {
      input: "Fetch failed at https://example.com/v1/access_token/path-sentinel/resource",
      sentinel: "path-sentinel",
      preserved: ["example.com/v1/access_token/", "/resource", "Fetch failed"],
    },
    {
      input: "POST https://discord.com/api/webhooks/123456/discord-sentinel returned 404",
      sentinel: "discord-sentinel",
      preserved: ["discord.com/api/webhooks/", "POST", "404"],
    },
    {
      input: "Webhook https://hooks.slack.com/services/T000/B000/slack-sentinel failed",
      sentinel: "slack-sentinel",
      preserved: ["hooks.slack.com/services/", "Webhook", "failed"],
    },
    {
      input: "Request https://example.com/run?ACCESS_TOKEN=query-sentinel&mode=safe failed",
      sentinel: "query-sentinel",
      preserved: ["example.com/run", "ACCESS_TOKEN=", "mode=safe"],
    },
    {
      input: `Contact ${email} after the request`,
      sentinel: email,
      preserved: ["Contact", "after the request"],
    },
  ];

  it.each(credentialCases)("redacts credentials from surrounding text", (testCase) => {
    const redacted = redactStringCredentials(testCase.input);

    expect(redacted).not.toContain(testCase.sentinel);
    expect(redacted).toContain("[REDACTED");
    for (const preserved of testCase.preserved) expect(redacted).toContain(preserved);
  });

  it.each([
    "https://example.com/users/01J2Y3Z4/resource/opaque-id",
    "https://example.com/orders/123456/items/abcdef",
    "GET /api/projects/project_123 returned 200",
    "https://example.com/bottom-navigation",
  ])("does not redact ordinary opaque path IDs in %s", (value) => {
    expect(redactStringCredentials(value)).toBe(value);
  });

  it.each(["token", "access_token", "api-key", "secret", "password"])(
    "redacts explicitly labeled /%s/ path credentials",
    (label) => {
      const sentinel = `sentinel-${label}`;
      const redacted = redactStringCredentials(
        `Failure at https://example.com/v1/${label}/${sentinel}/resource`,
      );

      expect(redacted).not.toContain(sentinel);
      expect(redacted).toContain(`/${label}/[REDACTED]/resource`);
    },
  );
});
