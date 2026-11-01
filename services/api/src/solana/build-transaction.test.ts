import { address, type Instruction, type Rpc, type SolanaRpcApi } from "@solana/kit";
import { getAssertMinDeltaInstruction, getSnapshotInstruction } from "@xargos/guard-client";
import { BuildResponse } from "@xargos/shared";
import { describe, expect, it } from "vitest";
import type { Recipe, RecipeStep } from "../recipes/types";
import {
  buildResponse,
  EXPIRES_IN_MS,
  MAX_TRANSACTION_BYTES,
  REBUILD_WINDOW_MS,
} from "./build-transaction";

const AGENT = address("Vote111111111111111111111111111111111111111");
const WATCHED = address("SysvarC1ock11111111111111111111111111111111");
const SNAPSHOT = address("SysvarRent111111111111111111111111111111111");
const MINT = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const GUARD = address("97YMLtF9e6tW3e2ynHASe4qCB2e8uGnyGh5AmJNkJmCm");
const config = { programAddress: GUARD };
const NOW = new Date("2026-10-29T10:00:00.000Z");

// A blockhash is 32 bytes in base58: 32 ones is 32 zero bytes, valid and enough for a test.
const rpc = {
  getLatestBlockhash: () => ({
    send: async () => ({
      value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1n },
    }),
  }),
} as unknown as Rpc<SolanaRpcApi>;

const guardStep = (instruction: Instruction, label: string): RecipeStep => ({
  instruction,
  label,
  protocol: "xARGOS guard",
  kind: "guard",
});

function recipe(middle: RecipeStep[] = []): Recipe {
  return {
    info: {
      id: "exit-orca-lp-to-usdc",
      name: "Exit",
      description: "x",
      price: { amount: "10000", mint: MINT },
    },
    build: async () => ({
      steps: [
        guardStep(
          getSnapshotInstruction({ agentTokenAccount: WATCHED, snapshot: SNAPSHOT }, config),
          "Record",
        ),
        ...middle,
        guardStep(
          getAssertMinDeltaInstruction(
            { agentTokenAccount: WATCHED, snapshot: SNAPSHOT, minDelta: 9_900_000n },
            config,
          ),
          "Check",
        ),
      ],
      quote: { tokenOut: MINT, expectedOut: "10000000", slippageBps: 100 },
      guard: { programId: GUARD, mint: MINT, watchedAccount: WATCHED, minDelta: "9900000" },
    }),
  };
}

const params = (r: Recipe) => ({
  recipe: r,
  context: { agent: AGENT, position: MINT },
  buildId: "bld_test",
  rpc,
  now: NOW,
});

describe("buildResponse", () => {
  it("returns a response that satisfies the shared contract", async () => {
    const response = await buildResponse(params(recipe()));
    expect(BuildResponse.safeParse(response).success).toBe(true);
    expect(response.recipeId).toBe("exit-orca-lp-to-usdc");
  });

  it("puts the snapshot first and the assert last, and tags them as guard", async () => {
    const middle: RecipeStep = {
      instruction: { programAddress: address("11111111111111111111111111111111"), accounts: [] },
      label: "Wrap SOL",
      protocol: "System",
      kind: "setup",
    };
    const response = await buildResponse(params(recipe([middle])));
    expect(response.guard.snapshotIndex).toBe(0);
    expect(response.guard.assertIndex).toBe(2);
    expect(response.steps.map((s) => s.kind)).toEqual(["guard", "setup", "guard"]);
    expect(response.steps.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it("watches the account the guard reads", async () => {
    const response = await buildResponse(params(recipe()));
    expect(response.watchAccounts).toEqual([WATCHED]);
    expect(response.guard.watchedAccount).toBe(WATCHED);
  });

  it("sets the expiry and the free rebuild window from the build time", async () => {
    const response = await buildResponse(params(recipe()));
    expect(Date.parse(response.expiresAt)).toBe(NOW.getTime() + EXPIRES_IN_MS);
    expect(Date.parse(response.rebuildUntil)).toBe(NOW.getTime() + REBUILD_WINDOW_MS);
  });

  it("refuses a transaction that does not fit in 1232 bytes", async () => {
    const big: RecipeStep = {
      instruction: {
        programAddress: address("11111111111111111111111111111111"),
        accounts: [],
        data: new Uint8Array(MAX_TRANSACTION_BYTES),
      },
      label: "Too big",
      protocol: "System",
      kind: "setup",
    };
    await expect(buildResponse(params(recipe([big])))).rejects.toThrow(
      /needs an address lookup table/,
    );
  });
});
