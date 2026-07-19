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

describe("extended provider coverage", () => {
  it.each([
    ["https://api.moonshot.ai/v1/chat/completions", "moonshot"],
    ["https://api.moonshot.cn/v1/chat/completions", "moonshot"],
    ["https://api.z.ai/api/paas/v4/chat/completions", "zai"],
    ["https://open.bigmodel.cn/api/paas/v4/chat/completions", "zai"],
    ["https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", "qwen"],
    ["https://dashscope-intl.aliyuncs.com/api/v1", "qwen"],
    ["https://api.minimaxi.com/v1/text/chatcompletion_v2", "minimax"],
    ["https://api.lingyiwanwu.com/v1/chat/completions", "yi"],
    ["https://api.stepfun.com/v1/chat/completions", "stepfun"],
    ["https://api.siliconflow.cn/v1/chat/completions", "siliconflow"],
    ["https://api.cerebras.ai/v1/chat/completions", "cerebras"],
    ["https://api.sambanova.ai/v1/chat/completions", "sambanova"],
    ["https://api.deepinfra.com/v1/openai/chat/completions", "deepinfra"],
    ["https://models.github.ai/inference/chat/completions", "github-models"],
    ["https://ai-gateway.vercel.sh/v1/chat/completions", "vercel-ai-gateway"],
    ["https://gateway.ai.cloudflare.com/v1/acct/gw/openai", "cloudflare-ai-gateway"],
    ["https://queue.fal.run/fal-ai/flux", "fal"],
    ["https://api.deepgram.com/v1/listen", "deepgram"],
  ])("%s -> %s", (url, provider) => {
    expect(providerForUrl(url)).toBe(provider);
  });

  it("names GLM/Kimi failures clearly", () => {
    expect(
      describeFailedRequest("POST", "https://api.moonshot.ai/v1/chat/completions", 429)?.error.name,
    ).toBe("MoonshotApiError");
    expect(
      describeFailedRequest("POST", "https://open.bigmodel.cn/api/paas/v4/chat", 500)?.error.name,
    ).toBe("ZaiApiError");
  });
});
