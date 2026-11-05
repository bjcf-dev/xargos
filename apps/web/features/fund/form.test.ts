import type { FundAsset, FundQuote } from "@xargos/shared";
import { describe, expect, it } from "vitest";
import { defaultOrigin, type FundForm, formFromQuote, readFundForm, usdValue } from "./form";

const USDC_ARB: FundAsset = {
  assetId: "nep141:arb-usdc",
  symbol: "USDC",
  blockchain: "arb",
  decimals: 6,
  priceUsd: 1,
};
const USDC_BASE: FundAsset = {
  assetId: "nep141:base-usdc",
  symbol: "USDC",
  blockchain: "base",
  decimals: 6,
  priceUsd: 1,
};
const ETH_BASE: FundAsset = {
  assetId: "nep141:base-eth",
  symbol: "ETH",
  blockchain: "base",
  decimals: 18,
  priceUsd: 3000,
};
const ORIGINS = [USDC_ARB, USDC_BASE, ETH_BASE];

const VALID: FundForm = {
  originAsset: USDC_BASE.assetId,
  amount: "2",
  recipient: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
  refundTo: "0x1111111111111111111111111111111111111111",
};

describe("readFundForm", () => {
  it.each(["originAsset", "amount", "recipient", "refundTo"] as const)(
    "is incomplete, without errors, while %s is empty",
    (field) => {
      expect(readFundForm({ ...VALID, [field]: "  " }, ORIGINS)).toEqual({ kind: "incomplete" });
    },
  );

  it("turns a valid form into a request in base units", () => {
    expect(readFundForm(VALID, ORIGINS)).toEqual({
      kind: "ready",
      request: {
        originAsset: USDC_BASE.assetId,
        amount: "2000000",
        recipient: VALID.recipient,
        refundTo: VALID.refundTo,
      },
    });
  });

  it("uses the decimals of the chosen token", () => {
    const reading = readFundForm(
      { ...VALID, originAsset: ETH_BASE.assetId, amount: "0.001" },
      ORIGINS,
    );
    expect(reading).toMatchObject({ kind: "ready", request: { amount: "1000000000000000" } });
  });

  it.each([
    ["refundTo", "0x123"],
    ["refundTo", "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"],
    ["recipient", "not-an-address"],
    ["recipient", VALID.refundTo],
    ["amount", "0"],
    ["amount", "1.1234567"],
    ["amount", "two"],
    ["originAsset", "nep141:unknown"],
  ] as const)("flags %s = %j", (field, value) => {
    const reading = readFundForm({ ...VALID, [field]: value }, ORIGINS);
    expect(reading.kind).toBe("invalid");
    if (reading.kind !== "invalid") return;
    expect(Object.keys(reading.errors)).toEqual([field]);
    expect(reading.errors[field]).toMatch(/\w/);
  });
});

describe("defaultOrigin", () => {
  it("picks USDC on Base even when it is not first", () => {
    expect(defaultOrigin(ORIGINS)).toBe(USDC_BASE.assetId);
  });

  it("falls back to the first origin, or nothing", () => {
    expect(defaultOrigin([ETH_BASE])).toBe(ETH_BASE.assetId);
    expect(defaultOrigin([])).toBeUndefined();
  });
});

describe("formFromQuote", () => {
  it("fills the form with what was quoted", () => {
    const quote = {
      originAsset: USDC_BASE.assetId,
      amountInFormatted: "2",
      recipient: VALID.recipient,
      refundTo: VALID.refundTo,
    } as FundQuote;
    expect(formFromQuote(quote)).toEqual(VALID);
  });
});

describe("usdValue", () => {
  it("shows what the amount is worth", () => {
    expect(usdValue("2", USDC_BASE)).toBe("≈ $2.00");
    expect(usdValue("0.001", ETH_BASE)).toBe("≈ $3.00");
  });

  it("shows nothing for an amount it cannot read, or without a token", () => {
    expect(usdValue("two", USDC_BASE)).toBeUndefined();
    expect(usdValue("", USDC_BASE)).toBeUndefined();
    expect(usdValue("2", undefined)).toBeUndefined();
  });
});
