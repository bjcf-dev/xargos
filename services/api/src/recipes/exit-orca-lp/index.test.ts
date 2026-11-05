import {
  getClosePositionWithTokenExtensionsDiscriminatorBytes,
  getCollectFeesV2DiscriminatorBytes,
  getDecreaseLiquidityV2DiscriminatorBytes,
} from "@orca-so/whirlpools-client";
import {
  address,
  type Instruction,
  type ReadonlyUint8Array,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExitOrcaLpRecipe } from "./index";

// The Orca SDK is the only part that needs the network: it is replaced by a fixed pool state, so
// the recipe's own logic (order, guard, minimum, accounts, labels) runs for real (P1-9).
const orca = vi.hoisted(() => ({
  pool: { initialized: true, address: "", sqrtPrice: 0n },
  close: { tokenEstA: 0n, tokenEstB: 0n, feeOwedA: 0n, feeOwedB: 0n },
  swapOut: 0n,
  swapInput: [] as bigint[],
}));

const WHIRLPOOL_PROGRAM = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
const orcaIx = (data: ReadonlyUint8Array): Instruction => ({
  programAddress: address(WHIRLPOOL_PROGRAM),
  data,
});

vi.mock("@orca-so/whirlpools", async (importOriginal) => {
  const real = await importOriginal<typeof import("@orca-so/whirlpools")>();
  return {
    ...real,
    fetchConcentratedLiquidityPool: async () => orca.pool,
    closePositionInstructions: async () => ({
      quote: { tokenEstA: orca.close.tokenEstA, tokenEstB: orca.close.tokenEstB },
      feesQuote: { feeOwedA: orca.close.feeOwedA, feeOwedB: orca.close.feeOwedB },
      // Decrease, collect and close: what the SDK returns when fees are owed.
      instructions: [
        orcaIx(getDecreaseLiquidityV2DiscriminatorBytes()),
        orcaIx(getCollectFeesV2DiscriminatorBytes()),
        orcaIx(getClosePositionWithTokenExtensionsDiscriminatorBytes()),
      ],
    }),
    swapInstructions: async (_rpc: unknown, input: { inputAmount: bigint }) => {
      orca.swapInput.push(input.inputAmount);
      return { quote: { tokenEstOut: orca.swapOut }, instructions: [orcaIx(new Uint8Array([9]))] };
    },
  };
});

const WHIRLPOOL = address("3qTZVVZbPmCGE3h3GpGxNw6B3F6Z2NdYJeWiv4Kw38pS");
const DEMO_USDC = address("D1PzuAbRJB1io3awJX2GDoiL1ihwK9Kt9yfciLrgJFss");
const CIRCLE_USDC = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const GUARD = address("97YMLtF9e6tW3e2ynHASe4qCB2e8uGnyGh5AmJNkJmCm");
const AGENT = address("Vote111111111111111111111111111111111111111");
const POSITION = address("57eVnr4H1DsDdxYTTroLFe1j24XMXwQREANiUybL2Fsf");

const recipe = createExitOrcaLpRecipe({
  rpc: {} as Rpc<SolanaRpcApi>,
  whirlpool: WHIRLPOOL,
  usdcMint: DEMO_USDC,
  guardProgram: GUARD,
  priceAmount: "10000",
  priceMint: CIRCLE_USDC,
});

beforeEach(() => {
  // 0.02 SOL in the position, priced at ~134 demo USDC: the shape of a real demo A.
  orca.pool = { initialized: true, address: WHIRLPOOL, sqrtPrice: 123n };
  orca.close = {
    tokenEstA: 15_000_000n,
    tokenEstB: 1_300_000n,
    feeOwedA: 20_000n,
    feeOwedB: 5_000n,
  };
  orca.swapOut = 2_010_000n;
  orca.swapInput = [];
});

describe("createExitOrcaLpRecipe().build with a fixed pool", () => {
  it("opens with the guard's snapshot and closes with its assert, around the Orca steps", async () => {
    const built = await recipe.build({ agent: AGENT, position: POSITION });
    const kinds = built.steps.map((step) => step.kind);
    expect(kinds[0]).toBe("guard");
    expect(kinds.at(-1)).toBe("guard");
    expect(kinds.slice(1, -1)).not.toContain("guard");
    expect(built.steps[0]?.instruction.programAddress).toBe(GUARD);
    expect(built.steps.at(-1)?.instruction.programAddress).toBe(GUARD);
  });

  it("watches the agent's demo USDC account with both guard instructions", async () => {
    const built = await recipe.build({ agent: AGENT, position: POSITION });
    const [watched] = await findAssociatedTokenPda({
      owner: AGENT,
      mint: DEMO_USDC,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    expect(built.guard).toMatchObject({
      programId: GUARD,
      mint: DEMO_USDC,
      watchedAccount: watched,
    });
    for (const step of [built.steps[0], built.steps.at(-1)]) {
      expect(step?.instruction.accounts?.map((meta) => meta.address)).toContain(watched);
    }
  });

  it("swaps all the SOL the position returns, fees included", async () => {
    await recipe.build({ agent: AGENT, position: POSITION });
    expect(orca.swapInput).toEqual([15_020_000n]);
  });

  it("promises the USDC from the position plus the swap, minus the guard's 1 %", async () => {
    const built = await recipe.build({ agent: AGENT, position: POSITION });
    // 1_300_000 + 5_000 from the position, 2_010_000 from the swap.
    expect(built.quote.expectedOut).toBe("3315000");
    expect(built.guard.minDelta).toBe("3281850"); // 3_315_000 × 0.99
    expect(built.quote.slippageBps).toBe(100);
  });

  it("keeps the promised minimum on a free rebuild, even if the pool moved (lesson 10)", async () => {
    orca.swapOut = 1_000_000n; // the price fell after the first build
    const built = await recipe.build({
      agent: AGENT,
      position: POSITION,
      fixed: { expectedOut: 3_315_000n, minDelta: 3_281_850n },
    });
    expect(built.quote.expectedOut).toBe("3315000");
    expect(built.guard.minDelta).toBe("3281850");
  });

  it("lists the five agent accounts a client must compare (P0-5)", async () => {
    const built = await recipe.build({ agent: AGENT, position: POSITION });
    expect(built.watchAccounts).toHaveLength(5);
    expect(built.watchAccounts).toContain(AGENT);
    expect(new Set(built.watchAccounts).size).toBe(5);
  });

  it("names each step, the three Orca closing ones apart", async () => {
    const built = await recipe.build({ agent: AGENT, position: POSITION });
    expect(built.steps.map((step) => step.label)).toEqual([
      "Record the demo USDC balance",
      "Withdraw the liquidity",
      "Collect the fees",
      "Close the LP position",
      "Swap SOL to demo USDC",
      "Check the minimum demo USDC received",
    ]);
  });

  it("refuses a pool that is not the configured one", async () => {
    orca.pool = { initialized: true, address: CIRCLE_USDC, sqrtPrice: 123n };
    await expect(recipe.build({ agent: AGENT, position: POSITION })).rejects.toThrow(
      /does not match the demo pool/,
    );
  });

  it("gives the pool's price to the shock, so it aims below the agent's quote", async () => {
    const built = await recipe.build({ agent: AGENT, position: POSITION });
    expect(built.quoteSqrtPrice).toBe(123n);
  });
});
