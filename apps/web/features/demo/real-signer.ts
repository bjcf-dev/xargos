import { parseGuardFail } from "@xargos/shared";
import { failedInstructionIndex, type SendRpc, signAndSend } from "@/lib/solana/send";
import type { DemoSigner } from "./signer";

/** El signer de devnet: la clave del agente, en este navegador, firma la tx del build (D13). */
export function createRealSigner({
  rpc,
  keyPair,
}: {
  rpc: SendRpc;
  keyPair: CryptoKeyPair;
}): DemoSigner {
  return async (run, signal) => {
    const { assertIndex } = run.build.guard;
    const { signature, err, logs, fee } = await signAndSend({
      rpc,
      keyPair,
      transactionBase64: run.build.transaction,
      guardAssertIndex: assertIndex,
      signal,
    });
    if (err === null) return { outcome: "confirmed", signature };
    const instructionIndex = failedInstructionIndex(err);
    // Solo "guard" si falló el assert y su log se lee (D15).
    const guard = instructionIndex === assertIndex ? parseGuardFail(logs) : null;
    return {
      outcome: "reverted",
      signature,
      failure: { instructionIndex, guard, ...(fee !== null ? { networkFeeLamports: fee } : {}) },
    };
  };
}
