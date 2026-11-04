// @vitest-environment node
import { describe, expect, it } from "vitest";
import { barScale } from "./guarantee-bar";

describe("barScale", () => {
  it("places a guard revert below the minimum marker", () => {
    // 9.1 recibido, 9.95 mínimo, 10 esperado (demo USDC, 6 decimales).
    const { valuePct, minPct } = barScale(9_100_000n, 9_950_000n, 10_000_000n);
    expect(valuePct).toBeLessThan(minPct);
    expect(minPct).toBeGreaterThan(80);
    expect(valuePct).toBeGreaterThan(0);
  });

  it("keeps both marks inside the bar", () => {
    for (const [value, minimum, expected] of [
      [1n, 9_950_000n, 10_000_000n],
      [9_950_000n, 9_950_000n, 10_000_000n],
      [12_000_000n, 9_950_000n, 10_000_000n],
    ] as const) {
      const { valuePct, minPct } = barScale(value, minimum, expected);
      for (const pct of [valuePct, minPct]) {
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }
    }
  });

  it("puts a value equal to the minimum on the marker", () => {
    const { valuePct, minPct } = barScale(9_950_000n, 9_950_000n, 10_000_000n);
    expect(valuePct).toBe(minPct);
  });

  it("fills the bar when every figure is the same", () => {
    expect(barScale(5n, 5n, 5n)).toEqual({ valuePct: 100, minPct: 100 });
  });
});
