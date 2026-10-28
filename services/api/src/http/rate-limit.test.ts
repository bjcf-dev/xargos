import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit and then blocks", () => {
    const limiter = new RateLimiter(2, 1_000);
    expect(limiter.allow("ip", 0)).toBe(true);
    expect(limiter.allow("ip", 1)).toBe(true);
    expect(limiter.allow("ip", 2)).toBe(false);
  });

  it("counts each key on its own", () => {
    const limiter = new RateLimiter(1, 1_000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("b", 0)).toBe(true);
    expect(limiter.allow("a", 1)).toBe(false);
  });

  it("opens a new window once the time has passed", () => {
    const limiter = new RateLimiter(1, 1_000);
    expect(limiter.allow("ip", 0)).toBe(true);
    expect(limiter.allow("ip", 999)).toBe(false);
    expect(limiter.allow("ip", 1_000)).toBe(true);
  });
});
