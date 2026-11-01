import type { RevertFailure, Run } from "./types";

/** Resultado de firmar y enviar la tx de un run, tal como lo ve la cadena. */
export type SignOutcome =
  | { outcome: "confirmed"; signature: string }
  | { outcome: "reverted"; signature: string; failure: RevertFailure };

/** Lo que el signer sabe de la receta, aparte del run. */
export type SignContext = {
  /** El mint con el que se paga la receta (recipe.price.mint): el agente paga x402 desde su ATA. */
  paymentMint?: string;
};

/** Firma y envía la tx del run. El de mock está en mock-signer.ts; el real llega en F6. */
export type DemoSigner = (
  run: Run,
  signal: AbortSignal,
  context?: SignContext,
) => Promise<SignOutcome>;
