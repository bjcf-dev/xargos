import type { ErrorCode } from "@xargos/shared";

/**
 * Error único que lanza lib/api. `code` siempre es un ErrorCode del contrato,
 * para que la UI tenga un mensaje por código. Red caída o respuesta fuera de
 * contrato = INTERNAL.
 */
export class ApiClientError extends Error {
  readonly code: ErrorCode;
  /** Status HTTP; undefined si no hubo respuesta (fallo de red). */
  readonly status: number | undefined;
  readonly details: unknown;
  /** Cabecera PAYMENT-REQUIRED de un 402, intacta para x402. */
  readonly paymentRequired: string | undefined;
  /** Segundos de Retry-After (RATE_LIMITED); undefined si no vino o no se entiende. */
  readonly retryAfterSeconds: number | undefined;
  /** No contestó el backend: red caída o un 502/503/504 sin cuerpo del contrato. */
  readonly unreachable: boolean;
  /**
   * El backend (o la plataforma) contestó un error ≥ 400 que se entiende: x402 no liquidó (D17).
   * false si no se sabe: sin respuesta, una pasarela muda o un 2xx que no cumple el contrato.
   */
  readonly rejected: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      status?: number;
      details?: unknown;
      paymentRequired?: string;
      retryAfterSeconds?: number;
      unreachable?: boolean;
      rejected?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiClientError";
    this.code = code;
    this.status = options.status;
    this.details = options.details;
    this.paymentRequired = options.paymentRequired;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.unreachable = options.unreachable ?? false;
    this.rejected = options.rejected ?? false;
  }
}
