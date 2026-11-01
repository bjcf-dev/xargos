import { describe, expect, it } from "vitest";
import { formatUnits, USDC_DECIMALS } from "./format";

describe("formatUnits", () => {
  it.each([
    ["9950000", 6, "9.95"],
    ["10000000", 6, "10"],
    ["10000", 6, "0.01"],
    ["1", 6, "0.000001"],
    ["0", 6, "0"],
    ["50000000", 9, "0.05"],
    ["123456789012345678901", 6, "123456789012345.678901"],
  ])("formats %s with %i decimals as %s", (base, decimals, expected) => {
    expect(formatUnits(base, decimals)).toBe(expected);
  });

  it("accepts a bigint (guard amounts parsed from the logs)", () => {
    expect(formatUnits(9_100_000n, USDC_DECIMALS)).toBe("9.1");
  });

  it("rejects anything that is not base units", () => {
    expect(() => formatUnits("9.95", 6)).toThrow();
    expect(() => formatUnits("-1", 6)).toThrow();
  });
});
