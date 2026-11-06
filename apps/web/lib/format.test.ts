import { describe, expect, it } from "vitest";
import { formatUnits, parseUnits, USDC_DECIMALS } from "./format";

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

describe("parseUnits", () => {
  it.each([
    ["2", 6, 2_000_000n],
    ["0.8", 6, 800_000n],
    [" 1.234567 ", 6, 1_234_567n],
    ["2,5", 6, 2_500_000n],
    [".5", 6, 500_000n],
    ["2.", 6, 2_000_000n],
    ["0", 6, 0n],
    ["0.000000000000000001", 18, 1n],
  ])("reads %j with %i decimals as %s base units", (text, decimals, expected) => {
    expect(parseUnits(text, decimals)).toBe(expected);
  });

  // Más decimales de los que tiene el token: no se redondea, se rechaza.
  it.each(["", " ", "abc", "-1", "1e3", "1.2.3", "1,2,3", "1.1234567", "."])(
    "does not read %j",
    (text) => {
      expect(parseUnits(text, 6)).toBeUndefined();
    },
  );
});
