import { createSignerFromKeyPair } from "@solana/kit";
import { type PaymentPolicy, x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { SOLANA_DEVNET_CAIP2 } from "@x402/svm";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import type { FetchLike } from "@/lib/api/client";
import { ApiClientError } from "@/lib/api/errors";

/** Solo devnet (regla 1): el agente no paga en otra red aunque el backend lo pida. */
export const DEVNET_NETWORK = SOLANA_DEVNET_CAIP2;

/** Lo más que paga el agente por un build: el precio de la receta, en su mint (recipe.price). */
export type PaymentLimit = { mint: string; maxAmount: string };

/**
 * Qué pagos acepta el agente de un 402: `exact`, en devnet, en el mint de la receta y sin pasar
 * de su precio. El 402 lo escribe el backend; sin esto, el agente pagaría lo que le pidiera.
 */
export function paymentPolicy({ mint, maxAmount }: PaymentLimit): PaymentPolicy {
  const max = BigInt(maxAmount);
  return (_version, requirements) =>
    requirements.filter(
      (r) =>
        r.scheme === "exact" &&
        r.network === DEVNET_NETWORK &&
        r.asset === mint &&
        /^\d+$/.test(r.amount) &&
        BigInt(r.amount) <= max,
    );
}

/**
 * El fetch del agente para el build: si el backend contesta 402, paga con x402 (firma la clave
 * del agente, en este navegador) y repite la petición. El esquema lee el mint del pago por
 * `rpcUrl`, nuestra ruta /api/xargos/rpc: el RPC público por defecto lo bloquea la CSP.
 *
 * Un fallo al decidir o firmar el pago es un rechazo del agente (`rejected`: no se cobró nada),
 * con su motivo en el mensaje: INTERNAL, cuya tarjeta enseña el mensaje tal cual. Un fallo de
 * red (TypeError) o un abort sigue tal cual: el pago pudo liquidarse (D17).
 */
export function createPayingFetch({
  keyPair,
  rpcUrl,
  limit,
  fetch = (input, init) => globalThis.fetch(input, init),
}: {
  keyPair: CryptoKeyPair;
  rpcUrl: string;
  limit: PaymentLimit;
  fetch?: FetchLike;
}): FetchLike {
  const paying = createSignerFromKeyPair(keyPair).then((signer) =>
    wrapFetchWithPayment(
      fetch,
      x402Client.fromConfig({
        schemes: [{ network: DEVNET_NETWORK, client: new ExactSvmScheme(signer, { rpcUrl }) }],
        policies: [paymentPolicy(limit)],
        spendControls: {
          allowedAssets: [
            { network: DEVNET_NETWORK, asset: limit.mint, maxAmountPerPayment: limit.maxAmount },
          ],
        },
      }),
    ),
  );

  return async (input, init) => {
    const pay = await paying;
    try {
      return await pay(input, init);
    } catch (error) {
      if (error instanceof TypeError || init?.signal?.aborted) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw new ApiClientError(
        "INTERNAL",
        `The agent refused to pay what the backend asked: ${reason}`,
        {
          rejected: true,
          cause: error,
        },
      );
    }
  };
}
