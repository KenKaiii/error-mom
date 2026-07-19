import { describe, expect, it } from "vitest";
import { describeFailedRequest, providerForUrl, redactString, sanitize } from "./shared";

describe("SDK redaction", () => {
  it("removes secrets nested inside captured context", () => {
    expect(
      sanitize({
        authorization: "Bearer private",
        profile: { email: "person@example.com", project: "video-editor" },
      }),
    ).toEqual({
      authorization: "[REDACTED]",
      profile: { email: "[REDACTED_EMAIL]", project: "video-editor" },
    });
  });

  it("removes secret URL values while preserving useful route context", () => {
    expect(redactString("https://app.test/export?token=private&format=mp4")).toBe(
      "https://app.test/export?token=[REDACTED]&format=mp4",
    );
  });
});

describe("AI provider detection", () => {
  it("maps known LLM hosts to providers", () => {
    expect(providerForUrl("https://api.anthropic.com/v1/messages")).toBe("anthropic");
    expect(providerForUrl("https://api.openai.com/v1/chat/completions")).toBe("openai");
    expect(providerForUrl("https://openrouter.ai/api/v1/chat/completions")).toBe("openrouter");
    expect(providerForUrl("https://my-team.openai.azure.com/openai/deployments/x")).toBe(
      "azure-openai",
    );
  });

  it("ignores unknown hosts, lookalikes, and malformed URLs", () => {
    expect(providerForUrl("https://example.com/api")).toBeUndefined();
    expect(providerForUrl("https://fake-api.anthropic.com.evil.io/v1")).toBeUndefined();
    expect(providerForUrl("/relative/path")).toBeUndefined();
  });
});

describe("failed request policy", () => {
  it("captures provider 4xx with a provider-specific error name and tags", () => {
    const failure = describeFailedRequest("POST", "https://api.anthropic.com/v1/messages", 429);
    expect(failure?.error.name).toBe("AnthropicApiError");
    expect(failure?.error.message).toContain("returned 429");
    expect(failure?.context.tags).toMatchObject({
      provider: "anthropic",
      statusCode: "429",
      method: "POST",
    });
  });

  it("captures any 500 but skips non-provider 4xx", () => {
    expect(describeFailedRequest("GET", "https://example.com/api", 500)).toBeDefined();
    expect(describeFailedRequest("GET", "https://example.com/api", 404)).toBeUndefined();
    expect(describeFailedRequest("GET", "https://example.com/api", 429)).toBeUndefined();
  });

  it("camel-cases multi-word providers in the error name", () => {
    const failure = describeFailedRequest(
      "POST",
      "https://my-team.openai.azure.com/openai/deployments/x",
      500,
    );
    expect(failure?.error.name).toBe("AzureOpenaiApiError");
  });
});
