import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  getSignatureFromTransaction,
  type Instruction,
  isSolanaError,
  type KeyPairSigner,
  pipe,
  type Rpc,
  type RpcSubscriptions,
  type SignatureNotificationsApi,
  type SlotNotificationsApi,
  SOLANA_ERROR__JSON_RPC__INTERNAL_ERROR,
  SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR,
  type SolanaRpcApi,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";

export type SendInstructions = (instructions: Instruction[]) => Promise<string>;

type SignedTransaction = Parameters<ReturnType<typeof sendAndConfirmTransactionFactory>>[0];
type SendAndConfirm = (transaction: SignedTransaction) => Promise<void>;

export type SenderOptions = {
  log?: { error(data: object, message: string): void };
  /** Injectable for tests; by default Kit's send and confirm over RPC and WebSocket. */
  sendAndConfirm?: SendAndConfirm;
  sleep?: (ms: number) => Promise<void>;
};

/** Enough to ride out a short RPC hiccup without holding a setup for long. */
const RETRIES = 2;
const RETRY_DELAY_MS = 500;

/**
 * Worth another try: the RPC's `-32603 Internal error` (seen on 1 Nov, gone minutes later) and
 * network failures. Anything else, like a failed simulation, would fail the same way again.
 */
export function isTransient(error: unknown): boolean {
  return (
    isSolanaError(error, SOLANA_ERROR__JSON_RPC__INTERNAL_ERROR) ||
    isSolanaError(error, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR) ||
    error instanceof TypeError // fetch's "fetch failed"
  );
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Sends transactions paid and signed by the backend payer (plus signers embedded in the instructions). */
export function createSender(
  rpc: Rpc<SolanaRpcApi>,
  rpcSubscriptions: RpcSubscriptions<SignatureNotificationsApi & SlotNotificationsApi>,
  payer: KeyPairSigner,
  options: SenderOptions = {},
): SendInstructions {
  const {
    log,
    sendAndConfirm = (transaction) =>
      sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(transaction, {
        commitment: "confirmed",
      }),
    sleep = wait,
  } = options;

  /** Runs `task` again on a transient error, logging which call failed. */
  async function retrying<T>(call: string, task: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await task();
      } catch (error) {
        if (!isTransient(error) || attempt >= RETRIES) throw error;
        log?.error({ call, attempt: attempt + 1, error }, "transient RPC error, retrying");
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  /** True when the transaction already landed: then resending it is not needed. */
  async function landed(signature: ReturnType<typeof getSignatureFromTransaction>) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (!status || status.err) return false;
    return status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized";
  }

  return async (instructions) => {
    const { value: blockhash } = await retrying("getLatestBlockhash", () =>
      rpc.getLatestBlockhash().send(),
    );
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(payer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    );
    // Signed once: every retry sends these same bytes, so the transaction can land at most once.
    const signed = await signTransactionMessageWithSigners(message);
    assertIsTransactionWithBlockhashLifetime(signed);
    const signature = getSignatureFromTransaction(signed);
    let first = true;
    await retrying("sendAndConfirmTransaction", async () => {
      if (!first && (await landed(signature))) return;
      first = false;
      await sendAndConfirm(signed);
    });
    return signature;
  };
}
