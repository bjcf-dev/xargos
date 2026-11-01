import {
  appendTransactionMessageInstruction,
  compileTransaction,
  createSignerFromKeyPair,
  createTransactionMessage,
  type GetLatestBlockhashApi,
  getBase64Decoder,
  getTransactionEncoder,
  pipe,
  type Rpc,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { type SendResult, type SendRpc, signAndSend } from "@/lib/solana/send";

/**
 * Prueba de firma en devnet (solo desarrollo): 0 lamports del agente a sí mismo, firmada con
 * su clave de este navegador y enviada por /api/xargos/rpc. Solo cuesta la comisión de red.
 */
export async function sendTestTransaction(
  rpc: SendRpc & Rpc<GetLatestBlockhashApi>,
  keyPair: CryptoKeyPair,
  signal: AbortSignal,
): Promise<SendResult> {
  const agent = await createSignerFromKeyPair(keyPair);
  const { value: lifetime } = await rpc.getLatestBlockhash().send({ abortSignal: signal });
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(agent, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
    (m) =>
      appendTransactionMessageInstruction(
        getTransferSolInstruction({ source: agent, destination: agent.address, amount: 0 }),
        m,
      ),
  );
  const transactionBase64 = getBase64Decoder().decode(
    getTransactionEncoder().encode(compileTransaction(message)),
  );
  return signAndSend({ rpc, keyPair, transactionBase64, guardAssertIndex: null, signal });
}
