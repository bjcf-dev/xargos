// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

function limiter(max: number, windowMs = 60_000) {
  let now = 0;
  const limit = createRateLimiter({ max, windowMs, now: () => now });
  return { limit, advance: (ms: number) => (now += ms) };
}

describe("createRateLimiter", () => {
  it("allows up to max requests per key in a window", () => {
    const { limit } = limiter(2);
    expect(limit("a").allowed).toBe(true);
    expect(limit("a").allowed).toBe(true);
    expect(limit("a")).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it("counts each key apart", () => {
    const { limit } = limiter(1);
    expect(limit("a").allowed).toBe(true);
    expect(limit("b").allowed).toBe(true);
  });

  it("opens again when the window ends", () => {
    const { limit, advance } = limiter(1);
    limit("a");
    advance(59_000);
    expect(limit("a")).toEqual({ allowed: false, retryAfterSeconds: 1 });
    advance(1_000);
    expect(limit("a").allowed).toBe(true);
  });
});
