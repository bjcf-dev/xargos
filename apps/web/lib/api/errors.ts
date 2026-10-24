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

  constructor(
    code: ErrorCode,
    message: string,
    options: { status?: number; details?: unknown; paymentRequired?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiClientError";
    this.code = code;
    this.status = options.status;
    this.details = options.details;
    this.paymentRequired = options.paymentRequired;
  }
}
