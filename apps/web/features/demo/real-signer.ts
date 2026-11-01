import { parseGuardFail, verifyRecipeTransaction } from "@xargos/shared";
import { ApiClientError } from "@/lib/api/errors";
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
import type { DemoSigner, SignContext } from "./signer";
import type { Run } from "./types";

/**
 * Las cuentas del agente que la tx no debe tocar más de lo que la receta necesita: su wallet, la
 * de USDC demo del guard, la de wSOL, la de la posición (Token-2022) y la de USDC con la que paga
 * x402 (el USDC de Circle en devnet es del programa Token clásico). Las deriva el navegador y les
 * suma las que lista el backend: si el backend quitara una, se compararía igual.
 */
async function watchedAccounts(run: Run, { paymentMint }: SignContext): Promise<WatchedAccounts> {
  const { watchedAccount, minDelta } = run.build.guard;
  const payment = paymentMint
    ? await associatedTokenAddress(run.agent, paymentMint, TOKEN_PROGRAM)
    : undefined;
  const derived = [
    run.agent,
    watchedAccount,
    await associatedTokenAddress(run.agent, WSOL_MINT, TOKEN_PROGRAM),
    await associatedTokenAddress(run.agent, run.position, TOKEN_2022_PROGRAM),
    ...(payment ? [payment] : []),
  ];
  return {
    agent: run.agent,
    watched: watchedAccount,
    minDelta: BigInt(minDelta),
    payment,
    addresses: [...new Set([...derived, ...run.build.watchAccounts])],
  };
}

/**
 * El signer de devnet: la clave del agente, en este navegador, firma la tx del build (D13).
 * Antes de firmar comprueba la tx sin fiarse del backend (`verifyRecipeTransaction`): el agente
 * firma solo, programas conocidos, el guard donde dice el build y su mínimo. Lo que no se ve en
 * la tx (los saldos) lo compara `signAndSend` en la simulación.
 */
export function createRealSigner({
  rpc,
  keyPair,
  verify = verifyRecipeTransaction,
}: {
  rpc: SendRpc;
  keyPair: CryptoKeyPair;
  verify?: typeof verifyRecipeTransaction;
}): DemoSigner {
  return async (run, signal, context = {}) => {
    const check = verify(run.build.transaction, run.build, run.agent);
    if (!check.ok) {
      throw new ApiClientError(
        "INTERNAL",
        `The transaction is not what the recipe promised (${check.reason}); nothing was sent`,
      );
    }
    const { assertIndex } = run.build.guard;
    const { signature, err, logs, fee } = await signAndSend({
      rpc,
      keyPair,
      transactionBase64: run.build.transaction,
      guardAssertIndex: assertIndex,
      watch: await watchedAccounts(run, context),
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
