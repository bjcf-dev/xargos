import { describe, expect, it } from "vitest";
import { createPoolPrice } from "./pool-price";

/** sqrtPrice in Q64.64 for a human price of wSOL (9 decimals) in USDC (6 decimals). */
const sqrtPriceFor = (price: number) =>
  BigInt(Math.round(Math.sqrt(price * 10 ** (6 - 9)) * 2 ** 64));

describe("createPoolPrice", () => {
  it("turns the pool's sqrtPrice into a human price", async () => {
    const price = createPoolPrice({ readSqrtPrice: async () => sqrtPriceFor(134) });
    expect(await price.read()).toBe("134.0000");
  });

  it("answers null when the RPC fails, so /health stays up", async () => {
    const price = createPoolPrice({
      readSqrtPrice: async () => {
        throw new Error("rpc down");
      },
    });
    expect(await price.read()).toBeNull();
  });

  it("caches the price for 30 s, so a public /health cannot burn the RPC quota", async () => {
    let calls = 0;
    let clock = 0;
    const price = createPoolPrice({
      readSqrtPrice: async () => {
        calls++;
        return sqrtPriceFor(134);
      },
      now: () => clock,
    });
    await price.read();
    clock += 29_000;
    await price.read();
    expect(calls).toBe(1);
    clock += 2_000;
    await price.read();
    expect(calls).toBe(2);
  });
});
