import { describe, expect, it } from "vitest";
import { expectedOut, GUARD_SLIPPAGE_BPS, minDelta, STEP_SLIPPAGE_BPS, swapFee } from "./min-delta";

describe("quote", () => {
  it("keeps the guard stricter than the intermediate steps (D10)", () => {
    expect(GUARD_SLIPPAGE_BPS).toBeLessThan(STEP_SLIPPAGE_BPS);
  });

  it("charges the pool fee rounded up", () => {
    expect(swapFee(10_000_000n, 3000)).toBe(30_000n);
    expect(swapFee(1n, 3000)).toBe(1n);
    expect(swapFee(0n, 3000)).toBe(0n);
  });

  it("adds what comes from the position and from the swap", () => {
    expect(expectedOut({ usdcFromPosition: 5_000_000n, usdcFromSwap: 4_990_000n })).toBe(
      9_990_000n,
    );
  });

  it("applies the guard slippage and rounds down", () => {
    expect(minDelta(10_000_000n, 100)).toBe(9_900_000n);
    expect(minDelta(9_999_999n, 100)).toBe(9_899_999n);
    expect(minDelta(10_000_000n, 0)).toBe(10_000_000n);
  });

  it("never returns a zero minDelta, which the guard rejects", () => {
    expect(() => minDelta(0n)).toThrow(RangeError);
    expect(() => minDelta(1n, 10_000)).toThrow(RangeError);
  });

  it("rejects a slippage outside 0 to 10000 bps", () => {
    expect(() => minDelta(1_000n, -1)).toThrow(RangeError);
    expect(() => minDelta(1_000n, 10_001)).toThrow(RangeError);
  });
});
