import { describe, expect, it } from "vitest";
import { redactString, sanitize } from "./shared";

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
