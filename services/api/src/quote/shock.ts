// Pure maths for the price shock (B12). In a concentrated-liquidity pool with constant liquidity L
// between two ticks, selling x of token A moves 1/sqrtP by x/L, and buying with y of token B moves
// sqrtP by y/L. sqrtPrice comes as Q64.64 from the Whirlpool account.
const Q64 = 2 ** 64;
const PPM = 1_000_000;

const sqrtOf = (sqrtPriceX64: bigint) => Number(sqrtPriceX64) / Q64;

/** Raw price (token B base units per token A base unit). */
export function rawPrice(sqrtPriceX64: bigint): number {
  return sqrtOf(sqrtPriceX64) ** 2;
}

/** Human price: token B per whole token A, given both decimals (SOL 9, USDC 6). */
export function humanPrice(sqrtPriceX64: bigint, decimalsA: number, decimalsB: number): number {
  return rawPrice(sqrtPriceX64) * 10 ** (decimalsA - decimalsB);
}

/**
 * Token A (SOL, lamports) to sell so the price falls `dropBps`, grossed up for the pool fee
 * (`feeRate` in parts per million, read from the Whirlpool account: lesson 9).
 * Valid while the move stays inside the active liquidity range.
 */
export function amountToSell(
  liquidity: bigint,
  sqrtPriceX64: bigint,
  dropBps: number,
  feeRate: number,
): bigint {
  if (dropBps <= 0 || dropBps >= 10_000) throw new RangeError("dropBps must be between 1 and 9999");
  const s0 = sqrtOf(sqrtPriceX64);
  const s1 = s0 * Math.sqrt(1 - dropBps / 10_000);
  const net = Number(liquidity) * (1 / s1 - 1 / s0);
  return BigInt(Math.ceil(net / (1 - feeRate / PPM)));
}

/**
 * Token B (demo USDC, base units) to buy back so the price climbs from `sqrtNow` to `sqrtTarget`.
 * Used to put the pool back at its baseline after a shock.
 */
export function amountToRestore(
  liquidity: bigint,
  sqrtNowX64: bigint,
  sqrtTargetX64: bigint,
  feeRate: number,
): bigint {
  const gap = sqrtOf(sqrtTargetX64) - sqrtOf(sqrtNowX64);
  if (gap <= 0) return 0n;
  return BigInt(Math.ceil((Number(liquidity) * gap) / (1 - feeRate / PPM)));
}
