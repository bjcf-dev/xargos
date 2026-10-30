import {
  fetchConcentratedLiquidityPool,
  orderMints,
  setNativeMintWrappingStrategy,
  swapInstructions,
  WhirlpoolDeployment,
} from "@orca-so/whirlpools";
import type { Address, KeyPairSigner, Rpc, SolanaRpcApi } from "@solana/kit";
import { amountToRestore, amountToSell, humanPrice } from "../quote/shock";
import { POOL_TICK_SPACING, WSOL_MINT } from "../solana/constants";
import type { SendInstructions } from "../solana/send";
import type { ShockSteps } from "./shock";

export type ShockStepsDeps = {
  rpc: Rpc<SolanaRpcApi>;
  send: SendInstructions;
  /** The backend payer: it sells and buys in the pool with its own funds. */
  payer: KeyPairSigner;
  whirlpool: Address;
  demoUsdc: Address;
  /** How far the price falls, in basis points. Calibrated against the guard (D10). */
  dropBps: number;
};

const SOL_DECIMALS = 9;
const USDC_DECIMALS = 6;

/** The on-chain side of /demo/price-shock. Selling SOL pushes the price down; buying it back restores. */
export function createShockSteps(
  d: ShockStepsDeps,
): ShockSteps & { restoreTo(humanPrice: number): Promise<void> } {
  // The sqrtPrice from before the last shock: restore() aims back at it.
  let baselineSqrtPrice: bigint | null = null;

  async function pool() {
    const [mintA, mintB] = orderMints(WSOL_MINT, d.demoUsdc);
    const state = await fetchConcentratedLiquidityPool(
      d.rpc,
      mintA,
      mintB,
      POOL_TICK_SPACING,
      WhirlpoolDeployment.devnet,
    );
    if (!state.initialized || state.address !== d.whirlpool) {
      throw new Error("The configured Whirlpool does not match the demo pool");
    }
    return state;
  }

  const swapAsPayer = async (inputAmount: bigint, mint: Address) => {
    setNativeMintWrappingStrategy("ata");
    // No minimum: the shock is meant to move the price whatever it costs (the payer's own funds).
    const { instructions } = await swapInstructions(d.rpc, { inputAmount, mint }, d.whirlpool, {
      slippageToleranceBps: 10_000,
      signer: d.payer,
      whirlpoolDeployment: WhirlpoolDeployment.devnet,
    });
    return d.send(instructions);
  };

  return {
    async shock() {
      const before = await pool();
      baselineSqrtPrice = before.sqrtPrice;
      const sell = amountToSell(before.liquidity, before.sqrtPrice, d.dropBps, before.feeRate);
      const signature = await swapAsPayer(sell, WSOL_MINT);
      const after = await pool();
      return {
        signature,
        priceBefore: humanPrice(before.sqrtPrice, SOL_DECIMALS, USDC_DECIMALS).toFixed(4),
        priceAfter: humanPrice(after.sqrtPrice, SOL_DECIMALS, USDC_DECIMALS).toFixed(4),
      };
    },

    /** Puts the pool at a chosen price (SOL in USDC). For operators: it resets a drifted demo pool. */
    async restoreTo(price) {
      baselineSqrtPrice = BigInt(
        Math.round(Math.sqrt(price / 10 ** (SOL_DECIMALS - USDC_DECIMALS)) * 2 ** 64),
      );
      await this.restore();
    },

    async restore() {
      if (baselineSqrtPrice === null) return;
      const now = await pool();
      const buy = amountToRestore(now.liquidity, now.sqrtPrice, baselineSqrtPrice, now.feeRate);
      if (buy > 0n) await swapAsPayer(buy, d.demoUsdc);
      baselineSqrtPrice = null;
    },
  };
}
