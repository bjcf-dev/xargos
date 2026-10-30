import { describe, expect, it } from "vitest";
import {
  amountToRestore,
  amountToSell,
  amountToSellTo,
  humanPrice,
  rawPrice,
  targetSqrtPrice,
} from "./shock";

const Q64 = 2n ** 64n;
// sqrtPrice for a human price of 150 USDC per SOL: raw = 150 * 1e6 / 1e9 = 0.15.
const sqrtAt = (human: number) => BigInt(Math.round(Math.sqrt((human * 1e6) / 1e9) * 2 ** 64));
const LIQUIDITY = 1_700_000_000n;

describe("price shock maths", () => {
  it("reads the human price back from sqrtPrice", () => {
    expect(humanPrice(sqrtAt(150), 9, 6)).toBeCloseTo(150, 3);
    expect(rawPrice(Q64)).toBe(1);
  });

  it("sells about the amount that moves the price by the requested drop", () => {
    // 6% down from 150 is 141 (the shock of the shared fixture): ~0.138 SOL on 1.7e9 liquidity.
    const lamports = amountToSell(LIQUIDITY, sqrtAt(150), 600, 0);
    expect(Number(lamports)).toBeGreaterThan(1.2e8);
    expect(Number(lamports)).toBeLessThan(1.6e8);
  });

  it("needs more SOL for a bigger drop and for a pool with more liquidity", () => {
    const base = amountToSell(LIQUIDITY, sqrtAt(150), 300, 0);
    expect(amountToSell(LIQUIDITY, sqrtAt(150), 600, 0)).toBeGreaterThan(base);
    expect(amountToSell(LIQUIDITY * 2n, sqrtAt(150), 300, 0)).toBeGreaterThan(base);
  });

  it("grosses the amount up for the pool fee", () => {
    const free = amountToSell(LIQUIDITY, sqrtAt(150), 600, 0);
    const withFee = amountToSell(LIQUIDITY, sqrtAt(150), 600, 3_000);
    expect(withFee).toBeGreaterThan(free);
    expect(Number(withFee) / Number(free)).toBeCloseTo(1 / (1 - 0.003), 3);
  });

  it("rejects drops that make no sense", () => {
    expect(() => amountToSell(LIQUIDITY, sqrtAt(150), 0, 0)).toThrow(RangeError);
    expect(() => amountToSell(LIQUIDITY, sqrtAt(150), 10_000, 0)).toThrow(RangeError);
  });

  it("restores nothing when the price is already at or above the target", () => {
    expect(amountToRestore(LIQUIDITY, sqrtAt(150), sqrtAt(150), 0)).toBe(0n);
    expect(amountToRestore(LIQUIDITY, sqrtAt(151), sqrtAt(150), 0)).toBe(0n);
  });

  it("buys back enough USDC to climb from the shocked price to the baseline", () => {
    const usdc = amountToRestore(LIQUIDITY, sqrtAt(141), sqrtAt(150), 0);
    // Roughly the USDC the shock swap received, about 20 USDC for ~0.138 SOL at ~145.
    expect(Number(usdc)).toBeGreaterThan(1.5e7);
    expect(Number(usdc)).toBeLessThan(2.6e7);
  });

  it("aims below a reference price, whatever the pool price is now", () => {
    const quote = sqrtAt(150);
    const target = targetSqrtPrice(quote, 600);
    expect(humanPrice(target, 9, 6)).toBeCloseTo(141, 1);
    // pool at the quote: sells the usual amount
    expect(amountToSellTo(LIQUIDITY, quote, target, 0)).toBe(
      amountToSell(LIQUIDITY, quote, 600, 0),
    );
    // pool already low from another shock (126): it only has to go from 126 down to 141? it is below
    // the target already, so there is nothing to sell
    expect(amountToSellTo(LIQUIDITY, sqrtAt(126), target, 0)).toBe(0n);
    // pool a bit above the quote: it sells more than for the quote
    expect(amountToSellTo(LIQUIDITY, sqrtAt(155), target, 0)).toBeGreaterThan(
      amountToSellTo(LIQUIDITY, quote, target, 0),
    );
  });
});
