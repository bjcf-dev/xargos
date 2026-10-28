import {
  closePositionInstructions,
  fetchConcentratedLiquidityPool,
  orderMints,
  setNativeMintWrappingStrategy,
  swapInstructions,
  WhirlpoolDeployment,
} from "@orca-so/whirlpools";
import {
  type Address,
  createNoopSigner,
  type Instruction,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
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
import type { BuildContext, BuiltRecipe, Recipe, RecipeStep } from "../types";

export const EXIT_ORCA_LP_ID = "exit-orca-lp";
const WHIRLPOOL_PROGRAM = WhirlpoolDeployment.devnet.programId;
const WSOL_MINT = "So11111111111111111111111111111111111111112" as Address;

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

/** Tags each SDK instruction by the program that runs it: token plumbing is setup, Orca is the action. */
function tag(
  instructions: Instruction[],
  action: { label: string; protocol: string },
): RecipeStep[] {
  return instructions.map((instruction) =>
    instruction.programAddress === WHIRLPOOL_PROGRAM
      ? { instruction, kind: "action", ...action }
      : { instruction, kind: "setup", label: "Prepare token accounts", protocol: "SPL Token" },
  );
}

export function createExitOrcaLpRecipe(deps: ExitOrcaLpDeps): Recipe {
  return {
    info: {
      id: EXIT_ORCA_LP_ID,
      name: "Exit Orca LP to USDC",
      description:
        "Closes your Orca LP position and leaves everything in USDC. Reverts if you receive less than the guaranteed minimum.",
      price: { amount: deps.priceAmount, mint: deps.priceMint },
    },

    async build({ agent, position }: BuildContext): Promise<BuiltRecipe> {
      // The default wraps SOL in throwaway keypairs the agent would have to co-sign; use its wSOL ATA.
      setNativeMintWrappingStrategy("ata");
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
        64,
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

      const expected = expectedOut({ usdcFromPosition, usdcFromSwap: swap.quote.tokenEstOut });
      const min = minDelta(expected, GUARD_SLIPPAGE_BPS);

      const [watchedAccount] = await findAssociatedTokenPda({
        owner: agent,
        mint: deps.usdcMint,
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
          label: "Record the USDC balance",
          protocol: "xARGOS guard",
          kind: "guard",
        },
        ...tag(close.instructions, { label: "Close the LP position", protocol: "Orca Whirlpools" }),
        ...tag(swap.instructions, { label: "Swap SOL to USDC", protocol: "Orca Whirlpools" }),
        {
          instruction: getAssertMinDeltaInstruction(
            { agentTokenAccount: watchedAccount, snapshot, minDelta: min },
            guardConfig,
          ),
          label: "Check the minimum USDC received",
          protocol: "xARGOS guard",
          kind: "guard",
        },
      ];

      return {
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
