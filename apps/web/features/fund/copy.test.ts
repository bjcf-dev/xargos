import { describe, expect, it } from "vitest";
import { fundErrorText } from "./copy";

describe("fundErrorText", () => {
  it("passes on why Aurora would not quote", () => {
    const text = fundErrorText({ code: "FUND_QUOTE_FAILED", message: "Amount too low" });
    expect(text.title).toBe("Aurora can't quote this");
    expect(text.hint).toContain("Amount too low");
  });

  it("says Aurora is not answering, and to try again", () => {
    expect(fundErrorText({ code: "FUND_UNAVAILABLE", message: "down" })).toEqual({
      title: "Aurora isn't answering right now",
      hint: "Try again in a moment.",
    });
  });

  it("says how long to wait when there were too many requests", () => {
    expect(
      fundErrorText({ code: "RATE_LIMITED", message: "slow down", retryAfterSeconds: 30 }).hint,
    ).toContain("30 s");
    expect(fundErrorText({ code: "RATE_LIMITED", message: "slow down" }).hint).not.toMatch(
      /undefined/,
    );
  });

  it("says xARGOS cannot be reached when nothing answered", () => {
    expect(
      fundErrorText({ code: "INTERNAL", message: "Network error", unreachable: true }).title,
    ).toBe("Can't reach xARGOS");
    expect(fundErrorText({ code: "INTERNAL", message: "boom" }).title).toBe("Can't reach xARGOS");
  });
});
