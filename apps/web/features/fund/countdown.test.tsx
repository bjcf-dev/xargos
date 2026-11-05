import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCountdown, useCountdown } from "./countdown";

describe("formatCountdown", () => {
  it.each([
    [581_000, "9:41"],
    [5_000, "0:05"],
    [59_999, "0:59"],
    [3_723_000, "1:02:03"],
    [0, "0:00"],
    [-1, "0:00"],
    [Number.NaN, "0:00"],
  ])("shows %i ms as %s", (ms, text) => {
    expect(formatCountdown(ms)).toBe(text);
  });
});

describe("useCountdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("counts down every second and stops at zero", () => {
    let clock = 0;
    const now = () => clock;
    const { result } = renderHook(() => useCountdown(3_000, now));
    expect(result.current).toBe(3_000);

    for (const expected of [2_000, 1_000, 0, 0]) {
      act(() => {
        clock += 1_000;
        vi.advanceTimersByTime(1_000);
      });
      expect(result.current).toBe(expected);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is undefined without a time to count to", () => {
    const { result } = renderHook(() => useCountdown(undefined));
    expect(result.current).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
