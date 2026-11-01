const BPS = 10_000n;

/**
 * Slippage of the intermediate steps (close position, swap): 100%, that is, no minimum. The guard is the
 * only minimum (D10): with a price shock the position pays out less than quoted, and a step minimum
 * would make Orca fail before the guard does.
 */
export const STEP_SLIPPAGE_BPS = 10_000;
/** Slippage allowed by the guard: strict, so the guard is the one that reverts (D10). */
export const GUARD_SLIPPAGE_BPS = 100;

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
