// @vitest-environment node
import { fixtureBuildResponse, fixtureGuardFailLogs, fixtureSetupReady } from "@xargos/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  associatedTokenAddress,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  WSOL_MINT,
} from "@/lib/solana/ata";
import type { SendRpc, WatchedAccounts } from "@/lib/solana/send";

const signAndSend = vi.fn();
vi.mock("@/lib/solana/send", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/solana/send")>()),
  signAndSend: (args: unknown) => signAndSend(args),
}));

import { createRealSigner } from "./real-signer";
import type { Run } from "./types";

/** USDC de Circle en devnet: un mint del programa Token clásico (comprobado en devnet). */
const PAYMENT_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const run: Run = {
  agent: fixtureSetupReady.agent,
  position: fixtureSetupReady.position ?? "",
  build: fixtureBuildResponse,
};
const assertIndex = fixtureBuildResponse.guard.assertIndex;
const signer = createRealSigner({ rpc: {} as SendRpc, keyPair: {} as CryptoKeyPair });
const signal = new AbortController().signal;

beforeEach(() => signAndSend.mockReset());

function watchedIn(): WatchedAccounts {
  const args = signAndSend.mock.lastCall?.[0] as { watch: WatchedAccounts } | undefined;
  if (!args) throw new Error("signAndSend was not called");
  return args.watch;
}

describe("createRealSigner", () => {
  it("signs the build transaction with its guard index", async () => {
    signAndSend.mockResolvedValue({ signature: "sig", err: null, logs: [] });
    await expect(signer(run, signal)).resolves.toEqual({ outcome: "confirmed", signature: "sig" });
    expect(signAndSend).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionBase64: fixtureBuildResponse.transaction,
        guardAssertIndex: assertIndex,
        signal,
      }),
    );
  });

  // No se fía solo de watchAccounts del backend: añade las cuentas del agente que deriva él.
  it("watches the agent wallet, the guard account, its wSOL, its position and its USDC", async () => {
    signAndSend.mockResolvedValue({ signature: "sig", err: null, logs: [] });
    const build = { ...fixtureBuildResponse, watchAccounts: [] };
    await signer({ ...run, build }, signal, { paymentMint: PAYMENT_MINT });
    const watch = watchedIn();
    const payment = await associatedTokenAddress(run.agent, PAYMENT_MINT, TOKEN_PROGRAM);
    expect(watch.agent).toBe(run.agent);
    expect(watch.watched).toBe(fixtureBuildResponse.guard.watchedAccount);
    expect(watch.minDelta).toBe(BigInt(fixtureBuildResponse.guard.minDelta));
    expect(watch.payment).toBe(payment);
    expect([...watch.addresses].sort()).toEqual(
      [
        run.agent,
        fixtureBuildResponse.guard.watchedAccount,
        await associatedTokenAddress(run.agent, WSOL_MINT, TOKEN_PROGRAM),
        await associatedTokenAddress(run.agent, run.position, TOKEN_2022_PROGRAM),
        payment,
      ].sort(),
    );
  });

  it("watches no payment account when it does not know the mint", async () => {
    signAndSend.mockResolvedValue({ signature: "sig", err: null, logs: [] });
    await signer({ ...run, build: { ...fixtureBuildResponse, watchAccounts: [] } }, signal);
    expect(watchedIn().payment).toBeUndefined();
    expect(watchedIn().addresses).toHaveLength(4);
  });

  it("adds what the backend lists, once", async () => {
    signAndSend.mockResolvedValue({ signature: "sig", err: null, logs: [] });
    const extra = "D1PzuAbRJB1io3awJX2GDoiL1ihwK9Kt9yfciLrgJFss";
    await signer(
      { ...run, build: { ...fixtureBuildResponse, watchAccounts: [run.agent, extra] } },
      signal,
    );
    const watch = watchedIn();
    expect(watch.addresses).toContain(extra);
    expect(new Set(watch.addresses).size).toBe(watch.addresses.length);
  });

  it("reports guard only when the assert failed and GUARD_FAIL parses", async () => {
    signAndSend.mockResolvedValue({
      signature: "sig",
      err: { InstructionError: [assertIndex, { Custom: 6004 }] },
      logs: fixtureGuardFailLogs,
    });
    const outcome = await signer(run, signal);
    expect(outcome).toMatchObject({ outcome: "reverted", signature: "sig" });
    if (outcome.outcome !== "reverted") throw new Error("expected a revert");
    expect(outcome.failure.instructionIndex).toBe(assertIndex);
    expect(outcome.failure.guard).not.toBeNull();
  });

  it("reports another step without guard figures", async () => {
    signAndSend.mockResolvedValue({
      signature: "sig",
      err: { InstructionError: [assertIndex - 2, { Custom: 1 }] },
      logs: fixtureGuardFailLogs,
    });
    const outcome = await signer(run, signal);
    if (outcome.outcome !== "reverted") throw new Error("expected a revert");
    expect(outcome.failure).toEqual({ instructionIndex: assertIndex - 2, guard: null });
  });

  it("carries the network fee of a revert to the card (D16)", async () => {
    signAndSend.mockResolvedValue({
      signature: "sig",
      err: { InstructionError: [assertIndex, { Custom: 6004 }] },
      logs: fixtureGuardFailLogs,
      fee: 5000n,
    });
    const outcome = await signer(run, signal);
    if (outcome.outcome !== "reverted") throw new Error("expected a revert");
    expect(outcome.failure.networkFeeLamports).toBe(5000n);
  });

  it("leaves the fee out when the chain did not give it", async () => {
    signAndSend.mockResolvedValue({
      signature: "sig",
      err: { InstructionError: [assertIndex - 2, { Custom: 1 }] },
      logs: [],
      fee: null,
    });
    const outcome = await signer(run, signal);
    if (outcome.outcome !== "reverted") throw new Error("expected a revert");
    expect("networkFeeLamports" in outcome.failure).toBe(false);
  });
});
