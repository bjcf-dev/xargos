import {
  closePositionInstructions,
  fetchConcentratedLiquidityPool,
  orderMints,
  swapInstructions,
  WhirlpoolDeployment,
} from "@orca-so/whirlpools";
import { type Address, address, createNoopSigner, type Rpc, type SolanaRpcApi } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  findSnapshotStatePda,
  getAssertMinDeltaInstruction,
  getSnapshotInstruction,
} from "@xargos/guard-client";
import {
  expectedOut,
  GUARD_SLIPPAGE_BPS,
  minDelta,
  STEP_SLIPPAGE_BPS,
} from "../../quote/min-delta";
import { POOL_TICK_SPACING, WSOL_MINT } from "../../solana/constants";
import type { BuildContext, BuiltRecipe, Recipe, RecipeStep } from "../types";
import { withCollectFees } from "./collect-fees";
import { tagStep } from "./steps";

const TOKEN_2022_PROGRAM = address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

/** Same id as the contract fixture (packages/shared), which the front looks up. */
export const EXIT_ORCA_LP_ID = "exit-orca-lp-to-usdc";

export type ExitOrcaLpDeps = {
  rpc: Rpc<SolanaRpcApi>;
  /** Pool the position lives in (WHIRLPOOL_ADDRESS). */
  whirlpool: Address;
  /** Token the agent ends up with: the demo USDC of ADR 0003. */
  usdcMint: Address;
  guardProgram: Address;
  /** Price of the recipe in base units of `priceMint` (x402). */
  priceAmount: string;
  priceMint: Address;
};

export function createExitOrcaLpRecipe(deps: ExitOrcaLpDeps): Recipe {
  return {
    info: {
      id: EXIT_ORCA_LP_ID,
      name: "Exit Orca LP → USDC",
      description:
        "Withdraw liquidity, collect fees and swap everything to demo USDC, guarded on-chain. Reverts if you receive less than the guaranteed minimum.",
      price: { amount: deps.priceAmount, mint: deps.priceMint },
    },

    async build({ agent, position, fixed }: BuildContext): Promise<BuiltRecipe> {
      // The steps have no minimum of their own: the guard is the only one (D10). A price shock between
      // build and signing moves what the position pays out, and that must be caught by the guard.
      // Note: the swap spends `solOut` SOL from the agent's wallet after the wSOL account is closed. If
      // a shock makes the position return less SOL than estimated, the agent covers the difference
      // from its own SOL, which the guard (it only watches the demo USDC) does not see.
      const authority = createNoopSigner(agent); // the agent signs in its own wallet, never here
      const config = {
        authority,
        slippageToleranceBps: STEP_SLIPPAGE_BPS,
        whirlpoolDeployment: WhirlpoolDeployment.devnet,
      };

      // Fee rate comes from the Whirlpool account, never hardcoded (lesson 9).
      const [mintA, mintB] = orderMints(WSOL_MINT, deps.usdcMint);
      const pool = await fetchConcentratedLiquidityPool(
        deps.rpc,
        mintA,
        mintB,
        POOL_TICK_SPACING,
        WhirlpoolDeployment.devnet,
      );
      if (!pool.initialized || pool.address !== deps.whirlpool) {
        throw new Error("The configured Whirlpool does not match the demo pool");
      }

      const close = await closePositionInstructions(deps.rpc, position, config);
      const solOut = close.quote.tokenEstA + close.feesQuote.feeOwedA;
      const usdcFromPosition = close.quote.tokenEstB + close.feesQuote.feeOwedB;

      const swap = await swapInstructions(
        deps.rpc,
        { inputAmount: solOut, mint: WSOL_MINT },
        deps.whirlpool,
        {
          slippageToleranceBps: STEP_SLIPPAGE_BPS,
          signer: authority,
          whirlpoolDeployment: WhirlpoolDeployment.devnet,
        },
      );

      const expected =
        fixed?.expectedOut ??
        expectedOut({ usdcFromPosition, usdcFromSwap: swap.quote.tokenEstOut });
      const min = fixed?.minDelta ?? minDelta(expected, GUARD_SLIPPAGE_BPS);

      const [watchedAccount] = await findAssociatedTokenPda({
        owner: agent,
        mint: deps.usdcMint,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
      const [wsolAccount] = await findAssociatedTokenPda({
        owner: agent,
        mint: WSOL_MINT,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
      const [positionAccount] = await findAssociatedTokenPda({
        owner: agent,
        mint: position,
        tokenProgram: TOKEN_2022_PROGRAM,
      });
      const [paymentAccount] = await findAssociatedTokenPda({
        owner: agent,
        mint: deps.priceMint,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
      const [snapshot] = await findSnapshotStatePda(
        { agent, mint: deps.usdcMint },
        { programAddress: deps.guardProgram },
      );
      const guardConfig = { programAddress: deps.guardProgram };

      const steps: RecipeStep[] = [
        {
          instruction: getSnapshotInstruction(
            { agentTokenAccount: watchedAccount, snapshot },
            guardConfig,
          ),
          label: "Record the demo USDC balance",
          protocol: "xARGOS guard",
          kind: "guard",
        },
        ...withCollectFees(close.instructions, authority).map((instruction) =>
          tagStep(instruction, { label: "Close the LP position", protocol: "Orca Whirlpools" }),
        ),
        ...swap.instructions.map((instruction) =>
          tagStep(instruction, { label: "Swap SOL to demo USDC", protocol: "Orca Whirlpools" }),
        ),
        {
          instruction: getAssertMinDeltaInstruction(
            { agentTokenAccount: watchedAccount, snapshot, minDelta: min },
            guardConfig,
          ),
          label: "Check the minimum demo USDC received",
          protocol: "xARGOS guard",
          kind: "guard",
        },
      ];

      return {
        quoteSqrtPrice: pool.sqrtPrice,
        // Everything the agent has at stake: demo USDC, SOL (the wallet), wSOL, the position NFT and
        // the Circle USDC it pays x402 with, which this tx has no reason to touch.
        watchAccounts: [watchedAccount, agent, wsolAccount, positionAccount, paymentAccount],
        steps,
        quote: {
          tokenOut: deps.usdcMint,
          expectedOut: expected.toString(),
          slippageBps: GUARD_SLIPPAGE_BPS,
        },
        guard: {
          programId: deps.guardProgram,
          mint: deps.usdcMint,
          watchedAccount,
          minDelta: min.toString(),
        },
      };
    },
  };
}
