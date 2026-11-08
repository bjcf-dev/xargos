import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatClock, formatCountdown, formatWhen, useCountdown } from "./countdown";

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

describe("formatClock", () => {
  it("shows the hour and minute of an ISO time, in 24 h", () => {
    expect(formatClock("2026-11-06T12:30:00.000Z", "UTC")).toBe("12:30");
    expect(formatClock("2026-11-06T00:05:00.000Z", "UTC")).toBe("00:05");
  });

  it("is undefined for a time it cannot read", () => {
    expect(formatClock("not a date", "UTC")).toBeUndefined();
  });
});

describe("formatWhen", () => {
  const now = Date.parse("2026-11-08T10:00:00.000Z");

  it("shows only the time when it falls on the same day", () => {
    expect(formatWhen("2026-11-08T12:30:00.000Z", now, "UTC")).toBe("12:30");
  });

  it("adds the date when it falls on another day", () => {
    expect(formatWhen("2026-11-11T12:53:00.000Z", now, "UTC")).toBe("11 Nov, 12:53");
  });

  it("is undefined for a time it cannot read", () => {
    expect(formatWhen("not a date", now, "UTC")).toBeUndefined();
  });

  it("adds the date just past midnight", () => {
    const late = Date.parse("2026-11-08T23:50:00.000Z");
    expect(formatWhen("2026-11-09T00:10:00.000Z", late, "UTC")).toBe("9 Nov, 00:10");
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
