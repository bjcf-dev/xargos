import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  getSignatureFromTransaction,
  type Instruction,
  type KeyPairSigner,
  pipe,
  type Rpc,
  type RpcSubscriptions,
  type SignatureNotificationsApi,
  type SlotNotificationsApi,
  type SolanaRpcApi,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";

export type SendInstructions = (instructions: Instruction[]) => Promise<string>;

/** Sends transactions paid and signed by the backend payer (plus signers embedded in the instructions). */
export function createSender(
  rpc: Rpc<SolanaRpcApi>,
  rpcSubscriptions: RpcSubscriptions<SignatureNotificationsApi & SlotNotificationsApi>,
  payer: KeyPairSigner,
): SendInstructions {
  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  return async (instructions) => {
    const { value: blockhash } = await rpc.getLatestBlockhash().send();
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(payer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    );
    const signed = await signTransactionMessageWithSigners(message);
    assertIsTransactionWithBlockhashLifetime(signed);
    await sendAndConfirm(signed, { commitment: "confirmed" });
    return getSignatureFromTransaction(signed);
  };
}
