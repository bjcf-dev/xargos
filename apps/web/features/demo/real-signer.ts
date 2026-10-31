import { parseGuardFail } from "@xargos/shared";
import {
  associatedTokenAddress,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  WSOL_MINT,
} from "@/lib/solana/ata";
import {
  failedInstructionIndex,
  type SendRpc,
  signAndSend,
  type WatchedAccounts,
} from "@/lib/solana/send";
import type { DemoSigner } from "./signer";
import type { Run } from "./types";

/**
 * Las cuentas del agente que la tx no debe tocar más de lo que la receta necesita: su wallet, la
 * de USDC demo del guard, la de wSOL y la de la posición (Token-2022). Las deriva el navegador y
 * les suma las que lista el backend: si el backend quitara una, se compararía igual.
 */
async function watchedAccounts(run: Run): Promise<WatchedAccounts> {
  const { watchedAccount } = run.build.guard;
  const derived = [
    run.agent,
    watchedAccount,
    await associatedTokenAddress(run.agent, WSOL_MINT, TOKEN_PROGRAM),
    await associatedTokenAddress(run.agent, run.position, TOKEN_2022_PROGRAM),
  ];
  return {
    agent: run.agent,
    watched: watchedAccount,
    addresses: [...new Set([...derived, ...run.build.watchAccounts])],
  };
}

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
      watch: await watchedAccounts(run),
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
