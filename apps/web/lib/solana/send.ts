import {
  type GetSignatureStatusesApi,
  type GetTransactionApi,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getSignatureFromTransaction,
  getTransactionDecoder,
  isSolanaError,
  type Rpc,
  type SendTransactionApi,
  type Signature,
  type SimulateTransactionApi,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
  SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR,
  SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND,
  signTransaction,
} from "@solana/kit";
import { ApiClientError } from "@/lib/api/errors";
import { sleep } from "@/lib/api/poll";

/** Lo que el signer le pide a Solana, a través de /api/xargos/rpc. */
export type SendRpc = Rpc<
  SimulateTransactionApi & SendTransactionApi & GetSignatureStatusesApi & GetTransactionApi
>;

export type SendResult = { signature: string; err: unknown | null; logs: readonly string[] };

type SignAndSendArgs = {
  rpc: SendRpc;
  keyPair: CryptoKeyPair;
  transactionBase64: string;
  /** Índice de assert_min_delta; null si la tx no lleva guard. */
  guardAssertIndex: number | null;
  signal: AbortSignal;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

/** Índice de `{ InstructionError: [índice, …] }`; null con cualquier otra forma (D15). */
export function failedInstructionIndex(err: unknown): number | null {
  if (typeof err !== "object" || err === null || !("InstructionError" in err)) return null;
  const [index] = (err as { InstructionError: unknown[] }).InstructionError;
  if (typeof index === "number") return index;
  if (typeof index === "bigint") return Number(index);
  return null;
}

const expired = () =>
  new ApiClientError("BUILD_EXPIRED", "The transaction expired before it landed");

/**
 * Los errores de Kit no son para personas (en producción: "Solana error #…"): se traducen a
 * los códigos del contrato. Un abort o un ApiClientError propio pasan tal cual.
 */
function toSendError(error: unknown, signal: AbortSignal): unknown {
  if (signal.aborted || error instanceof ApiClientError) return error;
  if (
    isSolanaError(error, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE) &&
    isSolanaError(error.cause, SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND)
  ) {
    return expired();
  }
  if (
    isSolanaError(error, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR) &&
    error.context.statusCode === 429
  ) {
    return new ApiClientError("RATE_LIMITED", "Too many requests to Solana devnet; try again soon");
  }
  return new ApiClientError("INTERNAL", "Could not reach Solana devnet; try again in a moment", {
    cause: error,
  });
}

/**
 * Firma con la clave del agente, simula y envía. Si la simulación falla por el guard, se
 * envía igual para que revierta en la cadena (contrato: "La tx revierte on-chain"; D16).
 * Si falla por otra cosa, no se envía: no se paga la comisión de una tx que no aporta nada.
 */
export async function signAndSend({
  rpc,
  keyPair,
  transactionBase64,
  guardAssertIndex,
  signal,
  pollIntervalMs = 1_000,
  timeoutMs = 60_000,
}: SignAndSendArgs): Promise<SendResult> {
  let signature: Signature;
  try {
    signature = await signSimulateAndSend({
      rpc,
      keyPair,
      transactionBase64,
      guardAssertIndex,
      signal,
    });
  } catch (error) {
    throw toSendError(error, signal);
  }
  return confirm({ rpc, signature, signal, pollIntervalMs, timeoutMs });
}

async function signSimulateAndSend({
  rpc,
  keyPair,
  transactionBase64,
  guardAssertIndex,
  signal,
}: Pick<
  SignAndSendArgs,
  "rpc" | "keyPair" | "transactionBase64" | "guardAssertIndex" | "signal"
>): Promise<Signature> {
  const transaction = getTransactionDecoder().decode(getBase64Encoder().encode(transactionBase64));
  const signed = await signTransaction([keyPair], transaction);
  const wire = getBase64EncodedWireTransaction(signed);

  const simulation = await rpc
    .simulateTransaction(wire, { encoding: "base64", sigVerify: true })
    .send({ abortSignal: signal });
  const simErr = simulation.value.err;
  if (simErr === "BlockhashNotFound") throw expired();
  const failedAt = failedInstructionIndex(simErr);
  const guardFailed = simErr !== null && failedAt !== null && failedAt === guardAssertIndex;
  if (simErr !== null && !guardFailed) {
    const where = failedAt === null ? "" : ` at step ${failedAt}`;
    throw new ApiClientError("INTERNAL", `The transaction would fail${where}; nothing was sent`);
  }

  await rpc
    .sendTransaction(wire, { encoding: "base64", skipPreflight: guardFailed })
    .send({ abortSignal: signal });
  return getSignatureFromTransaction(signed);
}

/**
 * Ya enviada, la tx puede entrar aunque falle una consulta (429, 502, red): se sigue
 * preguntando hasta el plazo y, si no se pudo leer, el error lleva la firma para buscarla.
 */
async function confirm({
  rpc,
  signature,
  signal,
  pollIntervalMs,
  timeoutMs,
}: {
  rpc: SendRpc;
  signature: Signature;
  signal: AbortSignal;
  pollIntervalMs: number;
  timeoutMs: number;
}): Promise<SendResult> {
  const deadline = Date.now() + timeoutMs;
  let unreadable = false;
  while (Date.now() < deadline) {
    try {
      const { value } = await rpc.getSignatureStatuses([signature]).send({ abortSignal: signal });
      const status = value[0];
      const landed =
        status &&
        (status.err !== null ||
          status.confirmationStatus === "confirmed" ||
          status.confirmationStatus === "finalized");
      if (landed) {
        const tx = await rpc
          .getTransaction(signature, {
            commitment: "confirmed",
            encoding: "json",
            maxSupportedTransactionVersion: 0,
          })
          .send({ abortSignal: signal });
        if (tx?.meta) {
          return { signature, err: tx.meta.err ?? null, logs: tx.meta.logMessages ?? [] };
        }
      }
    } catch (error) {
      if (signal.aborted) throw error;
      unreadable = true;
    }
    await sleep(pollIntervalMs, signal);
  }
  if (unreadable) {
    throw new ApiClientError(
      "INTERNAL",
      `The transaction was sent but its result could not be read. Look up ${signature} in the explorer.`,
      { details: { signature } },
    );
  }
  throw expired();
}
