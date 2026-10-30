// @vitest-environment node
import { fixtureBuildResponse, fixtureGuardFailLogs, fixtureSetupReady } from "@xargos/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SendRpc } from "@/lib/solana/send";

const signAndSend = vi.fn();
vi.mock("@/lib/solana/send", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/solana/send")>()),
  signAndSend: (args: unknown) => signAndSend(args),
}));

import { createRealSigner } from "./real-signer";
import type { Run } from "./types";

const run: Run = {
  agent: fixtureSetupReady.agent,
  position: fixtureSetupReady.position ?? "",
  build: fixtureBuildResponse,
};
const assertIndex = fixtureBuildResponse.guard.assertIndex;
const signer = createRealSigner({ rpc: {} as SendRpc, keyPair: {} as CryptoKeyPair });
const signal = new AbortController().signal;

beforeEach(() => signAndSend.mockReset());

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
