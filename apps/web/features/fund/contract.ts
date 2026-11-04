/**
 * PROVISIONAL hasta que entre #97 (contrato fund en @xargos/shared): los mismos tipos que trae
 * esa PR, solo como tipos, para avanzar F14 sin esperar. Cuando entre, este archivo se borra y se
 * importa de `@xargos/shared`. Lleva ya `updatedAt` opcional, como se pidió en la revisión de #99,
 * porque Aurora puede contestar el estado solo con `{ status }`.
 */

/** Los 7 estados de Aurora (GET /api/status), tal cual. */
export type FundStatus =
  | "PENDING_DEPOSIT"
  | "KNOWN_DEPOSIT_TX"
  | "INCOMPLETE_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED";

/** Estados en los que Aurora ya no cambia nada: se deja de consultar. */
export const FUND_FINAL_STATUSES: readonly FundStatus[] = ["SUCCESS", "REFUNDED", "FAILED"];

export type FundQuoteRequest = {
  originAsset: string;
  /** Unidades base del token de origen. */
  amount: string;
  /** Dirección de Solana que escribe el usuario: nunca la clave del agente de la demo. */
  recipient: string;
  /** Dirección EVM de reembolso. */
  refundTo: string;
  dry: boolean;
};

export type FundQuote = {
  dry: boolean;
  originAsset: string;
  destinationAsset: string;
  recipient: string;
  refundTo: string;
  amountIn: string;
  amountInFormatted: string;
  amountInUsd: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd: string;
  minAmountOut: string;
  withdrawFee?: string;
  refundFee?: string;
  timeEstimateSeconds: number;
  /** Solo en una cotización real. */
  depositAddress?: string;
  depositMemo?: string;
  /** Hasta aquí se envía (Aurora, 4 nov): manda en la cuenta atrás y en `expired`. */
  deadline?: string;
  /** Desde aquí Aurora deja de vigilar la dirección. Respaldo si falta `deadline`. */
  timeWhenInactive?: string;
  correlationId?: string;
};

export type FundTx = { hash: string; explorerUrl: string };

export type FundStatusResponse = {
  depositAddress: string;
  depositMemo?: string;
  status: FundStatus;
  updatedAt?: string;
  amountIn?: string;
  amountInFormatted?: string;
  depositedAmount?: string;
  depositedAmountFormatted?: string;
  amountOut?: string;
  amountOutFormatted?: string;
  refundedAmount?: string;
  refundedAmountFormatted?: string;
  refundReason?: string;
  originTxs: FundTx[];
  destinationTxs: FundTx[];
  timeWhenInactive?: string;
  deadline?: string;
};
