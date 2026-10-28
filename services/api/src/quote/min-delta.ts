const BPS = 10_000n;

/** Slippage of the intermediate steps (decrease liquidity, swap): wide, so a swap never fails first (D10). */
export const STEP_SLIPPAGE_BPS = 500;
/** Slippage allowed by the guard: strict, so the guard is the one that reverts (D10). */
export const GUARD_SLIPPAGE_BPS = 100;

/** Orca fee rates are parts per million (3000 = 0.30%). */
const FEE_RATE_DENOMINATOR = 1_000_000n;

/** Fee Orca charges on an input amount, rounded up like the program does. */
export function swapFee(amountIn: bigint, feeRate: number): bigint {
  const numerator = amountIn * BigInt(feeRate);
  return (numerator + FEE_RATE_DENOMINATOR - 1n) / FEE_RATE_DENOMINATOR;
}

/** What the agent should end up receiving: USDC straight from the position plus the swap output. */
export function expectedOut(parts: { usdcFromPosition: bigint; usdcFromSwap: bigint }): bigint {
  return parts.usdcFromPosition + parts.usdcFromSwap;
}

/** Smallest delta the guard accepts: expectedOut minus the guard slippage, rounded down. */
export function minDelta(expected: bigint, slippageBps: number = GUARD_SLIPPAGE_BPS): bigint {
  if (slippageBps < 0 || slippageBps > 10_000) throw new RangeError("slippageBps out of range");
  const min = (expected * (BPS - BigInt(slippageBps))) / BPS;
  if (min <= 0n) throw new RangeError("minDelta must be greater than zero (the guard rejects 0)");
  return min;
}
