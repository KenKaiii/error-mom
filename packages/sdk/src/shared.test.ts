import { describe, expect, it } from "vitest";
import {
  createEvent,
  describeFailedRequest,
  providerForUrl,
  redactString,
  sanitize,
  wrapFunction,
} from "./shared";

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

  it.each([
    ["telegram", "https://api.telegram.org/bot123456:ABC_def/sendMessage"],
    ["userinfo", "https://user:sample-pass@example.com/path"],
    ["labeled path", "https://example.com/token/path-sentinel/resource"],
    ["discord", "https://discord.com/api/webhooks/123456/discord-sentinel"],
    ["slack", "https://hooks.slack.com/services/T000/B000/slack-sentinel"],
  ])("redacts %s URL credentials", (_, value) => {
    expect(redactString(value)).toContain("[REDACTED]");
  });

  it("sanitizes tags and breadcrumbs before event creation", () => {
    const sentinel = "capture-sentinel";
    const event = createEvent(
      new Error("capture failed"),
      {
        server: "https://errors.example.com",
        projectKey: "project-key",
        tags: { endpoint: `https://example.com/secret/${sentinel}` },
      },
      [
        {
          timestamp: "2026-07-20T00:00:00.000Z",
          category: "http",
          level: "error",
          message: `POST https://example.com/token/${sentinel} failed`,
          data: { url: `https://example.com/access_token/${sentinel}` },
        },
      ],
      "node",
      { tags: { webhook: `https://discord.com/api/webhooks/123/${sentinel}` } },
    );

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(sentinel);
    expect(event.tags.endpoint).toContain("example.com/secret/[REDACTED]");
    expect(event.breadcrumbs[0]?.message).toContain("example.com/token/[REDACTED]");
    expect(event.breadcrumbs[0]?.data?.url).toContain("access_token/[REDACTED]");
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
      retryable: "true",
    });
    expect(failure?.context.context).toEqual({
      request: {
        method: "POST",
        url: "https://api.anthropic.com/v1/messages",
        status: 429,
        retryable: true,
      },
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

  it("describes failed credential-bearing requests without leaking the credential", () => {
    const sentinel = ["123456", "FAILURE_SENTINEL"].join(":");
    const failure = describeFailedRequest(
      "POST",
      `https://api.telegram.org/bot${sentinel}/sendMessage`,
      500,
    );

    expect(failure?.error.message).toContain(
      "POST https://api.telegram.org/bot[REDACTED]/sendMessage",
    );
    expect(failure?.error.message).toContain("returned 500");
    expect(failure?.error.message).not.toContain(sentinel);
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

describe("wrapFunction", () => {
  it("captures and rethrows sync errors", () => {
    const captured: unknown[] = [];
    const wrapped = wrapFunction(
      (e) => {
        captured.push(e);
        return "id";
      },
      () => {
        throw new Error("sync boom");
      },
    );
    expect(() => wrapped()).toThrow("sync boom");
    expect(captured).toHaveLength(1);
  });

  it("captures and rethrows async rejections", async () => {
    const captured: unknown[] = [];
    const wrapped = wrapFunction(
      (e) => {
        captured.push(e);
        return "id";
      },
      async () => {
        throw new Error("async boom");
      },
    );
    await expect(wrapped()).rejects.toThrow("async boom");
    expect(captured).toHaveLength(1);
  });

  it("passes through arguments and return values untouched", async () => {
    const wrapped = wrapFunction(
      () => "id",
      async (a: number, b: number) => a + b,
    );
    await expect(wrapped(2, 3)).resolves.toBe(5);
  });
});
