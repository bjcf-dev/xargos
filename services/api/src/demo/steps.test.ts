import {
  address,
  createNoopSigner,
  type Instruction,
  type KeyPairSigner,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
import { describe, expect, it, vi } from "vitest";
import { createSetupSteps, type SetupStepsDeps } from "./steps";

const PAYER = createNoopSigner(
  address("3qybJ9ApEBWun7xvbnrVJ6NfDpvRGTBbppfxaFENe6SC"),
) as unknown as KeyPairSigner;
const AGENT = "Vote111111111111111111111111111111111111111";
const CIRCLE = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const DEMO = address("D1PzuAbRJB1io3awJX2GDoiL1ihwK9Kt9yfciLrgJFss");

/** Fake rpc answering the three reads the idempotent steps make. */
function fakeRpc(state: { lamports?: bigint; usdc?: string | null; snapshot?: boolean }) {
  return {
    getBalance: () => ({ send: async () => ({ value: state.lamports ?? 0n }) }),
    getTokenAccountBalance: () => ({
      send: async () => {
        if (state.usdc == null) throw new Error("no account");
        return { value: { amount: state.usdc } };
      },
    }),
    getAccountInfo: () => ({ send: async () => ({ value: state.snapshot ? {} : null }) }),
  } as unknown as Rpc<SolanaRpcApi>;
}

function steps(state: Parameters<typeof fakeRpc>[0], overrides: Partial<SetupStepsDeps> = {}) {
  const sent: Instruction[][] = [];
  const send = vi.fn(async (instructions: Instruction[]) => {
    sent.push(instructions);
    return "sig";
  });
  const built = createSetupSteps({
    rpc: fakeRpc(state),
    send,
    payer: PAYER,
    circleUsdc: CIRCLE,
    demoUsdc: DEMO,
    whirlpool: address("3qTZVVZbPmCGE3h3GpGxNw6B3F6Z2NdYJeWiv4Kw38pS"),
    guardProgram: address("97YMLtF9e6tW3e2ynHASe4qCB2e8uGnyGh5AmJNkJmCm"),
    fundSolLamports: 20_000_000n,
    fundUsdcBase: 50_000n,
    positionSolLamports: 50_000_000n,
    ...overrides,
  });
  return { built, sent, send };
}

describe("setup steps are safe to run again", () => {
  it("sends the SOL once: a funded agent is skipped", async () => {
    const funded = steps({ lamports: 20_000_000n });
    await funded.built.fundSol(AGENT);
    expect(funded.send).not.toHaveBeenCalled();

    const empty = steps({ lamports: 0n });
    await empty.built.fundSol(AGENT);
    expect(empty.send).toHaveBeenCalledOnce();
  });

  it("sends the USDC once: the accounts are ensured, the transfer is skipped when funded", async () => {
    const funded = steps({ usdc: "50000" });
    await funded.built.fundUsdc(AGENT);
    expect(funded.sent[0]).toHaveLength(2); // two idempotent account creations, no transfer

    const empty = steps({ usdc: null });
    await empty.built.fundUsdc(AGENT);
    expect(empty.sent[0]).toHaveLength(3); // + the transfer
  });

  it("does not transfer USDC at all when the amount is 0", async () => {
    const none = steps({ usdc: null }, { fundUsdcBase: 0n });
    await none.built.fundUsdc(AGENT);
    expect(none.sent[0]).toHaveLength(2);
  });

  it("creates the snapshot only if it does not exist yet", async () => {
    const existing = steps({ snapshot: true });
    await existing.built.initSnapshot(AGENT);
    expect(existing.send).not.toHaveBeenCalled();

    const fresh = steps({ snapshot: false });
    await fresh.built.initSnapshot(AGENT);
    expect(fresh.send).toHaveBeenCalledOnce();
  });
});
