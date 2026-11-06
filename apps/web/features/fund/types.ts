import type {
  ErrorCode,
  FundQuote,
  FundQuoteRequest,
  FundStatus,
  FundStatusResponse,
} from "@xargos/shared";

export type FundError = {
  /** Incluye FUND_QUOTE_FAILED (Aurora no cotiza) y FUND_UNAVAILABLE (Aurora no responde). */
  code: ErrorCode;
  message: string;
  retryAfterSeconds?: number;
  /** El backend no contestó. */
  unreachable?: true;
};

/**
 * La dirección a la que el usuario envía y sus plazos. Es lo que se guarda para seguir tras
 * recargar: sin ella no se sabría dónde está el dinero.
 */
export type Deposit = {
  depositAddress: string;
  depositMemo?: string;
  /** Hasta aquí se envía (Aurora, 4 nov). */
  deadline?: string;
  /** Respaldo si falta `deadline`. */
  timeWhenInactive?: string;
  /** Lo que se enseñó al pedir la dirección (importes y comisiones). */
  quote: FundQuote;
};

export type FundState =
  | { status: "idle" }
  /** Cotización `dry` en vuelo: solo el precio. */
  | { status: "previewing"; request: FundQuoteRequest }
  | { status: "previewed"; request: FundQuoteRequest; preview: FundQuote }
  /** Cotización real en vuelo: pide la dirección de depósito. */
  | { status: "requesting"; request: FundQuoteRequest; preview?: FundQuote }
  | {
      status: "tracking";
      deposit: Deposit;
      /** undefined hasta la primera respuesta (p. ej. justo tras recargar). */
      aurora?: FundStatus;
      latest?: FundStatusResponse;
      /** Venció el plazo en PENDING_DEPOSIT: la siguiente respuesta decide si es `expired`. */
      lastCheck?: true;
      /** La última consulta falló: se reintenta sin perder el depósito. */
      lastError?: FundError;
    }
  /**
   * Aurora no conoce la dirección (NOT_FOUND, #136) y nunca había contestado por ella: p. ej. un
   * localStorage viejo o tocado a mano. Reintentar no cambia nada.
   */
  | { status: "unknown"; deposit: Deposit }
  /** Pasó el plazo y la última consulta seguía en PENDING_DEPOSIT: no enviar nada. */
  | { status: "expired"; deposit: Deposit; latest?: FundStatusResponse }
  /** Falló una cotización: todavía no hay dinero en juego. */
  | { status: "error"; error: FundError; request: FundQuoteRequest };

export type FundEvent =
  | { type: "PREVIEW_REQUESTED"; request: FundQuoteRequest }
  | { type: "PREVIEW_RECEIVED"; preview: FundQuote }
  | { type: "DEPOSIT_REQUESTED"; request: FundQuoteRequest }
  | { type: "DEPOSIT_RECEIVED"; quote: FundQuote }
  /** `dry`: falló un precio, no la petición de la dirección. */
  | { type: "QUOTE_FAILED"; error: FundError; dry?: true }
  | { type: "STATUS_RECEIVED"; status: FundStatusResponse }
  | { type: "STATUS_FAILED"; error: FundError }
  /** Llega con el plazo vencido (la hora la decide quien despacha). */
  | { type: "DEADLINE_PASSED" }
  /** Recuperar un depósito guardado al recargar. */
  | { type: "RESTORED"; deposit: Deposit }
  | { type: "RESET" };

export const initialFundState: FundState = { status: "idle" };
