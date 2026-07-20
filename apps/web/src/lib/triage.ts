import type { ErrorEvent, IssueStatus } from "@kenkaiiii/error-mom-protocol";

export const OBSERVATION_PROMOTION_QUANTITY = 3;

export interface EventTriage {
  classification: "actionable" | "operational";
  initialStatus: Extract<IssueStatus, "open" | "observed">;
  reason: "application_error" | "provider_request" | "quota" | "tool_failure" | "transient";
  retryable: boolean | null;
}

export function classifyEvent(event: ErrorEvent): EventTriage {
  const status = Number(event.tags.statusCode ?? event.tags.status);
  const provider = event.tags.provider;
  const message = event.error.message;
  const culprit = event.culprit ?? "";

  if (status === 429) return operational("quota", true);

  const subscriptionTimeout =
    event.error.name === "SubscriptionUsageError" && /\b(?:timed? out|timeout)\b/i.test(message);
  const pollingFailure =
    /poll/i.test(culprit) ||
    /^\[[^\]]+\]\s+poll error:\s+(?:fetch failed|.*timed? out)/i.test(message);
  if (subscriptionTimeout || pollingFailure) return operational("transient", true);

  if (culprit.startsWith("tool.")) {
    return {
      classification: "actionable",
      initialStatus: "open",
      reason: "tool_failure",
      retryable: null,
    };
  }

  if (provider && status >= 400 && status < 500) {
    return {
      classification: "actionable",
      initialStatus: "open",
      reason: "provider_request",
      retryable: false,
    };
  }

  return {
    classification: "actionable",
    initialStatus: "open",
    reason: "application_error",
    retryable: status >= 500 ? true : null,
  };
}

function operational(reason: EventTriage["reason"], retryable: boolean): EventTriage {
  return { classification: "operational", initialStatus: "observed", reason, retryable };
}
