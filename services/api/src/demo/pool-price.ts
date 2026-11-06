import { humanPrice } from "../quote/shock";

export type PoolPrice = {
  /** Price of wSOL in demo USDC, as /health shows it; null when the RPC does not answer. */
  read(): Promise<string | null>;
};

const CACHE_MS = 30_000;
const SOL_DECIMALS = 9;
const USDC_DECIMALS = 6;

/**
 * The demo pool's price, for /health. Every demo B moves it; if a restore fails, the next setups
 * and recipes drift out of the position's range, and this is where it shows (P1-5). Cached like the
 * payer's balances: /health is public and each read costs RPC quota.
 */
export function createPoolPrice(d: {
  /** The pool's sqrtPrice (Q64.64), read from the Whirlpool account. */
  readSqrtPrice: () => Promise<bigint>;
  now?: () => number;
}): PoolPrice {
  const now = d.now ?? Date.now;
  // The promise, not the value: requests that arrive while a read is in flight share it.
  let cached: { at: number; value: Promise<string | null> } | undefined;

  async function fetchPrice(): Promise<string | null> {
    try {
      return humanPrice(await d.readSqrtPrice(), SOL_DECIMALS, USDC_DECIMALS).toFixed(4);
    } catch {
      return null;
    }
  }

  return {
    async read() {
      if (!cached || now() - cached.at >= CACHE_MS) cached = { at: now(), value: fetchPrice() };
      return cached.value;
    },
  };
}
