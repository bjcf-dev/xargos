import { z } from "zod";

/**
 * Códigos de error comunes a backend y frontend.
 * El contrato completo está en docs/api-contract.md.
 */
export const ErrorCode = z.enum([
  "PAYMENT_REQUIRED",
  "PAYMENT_INVALID",
  "BUILD_FAILED",
  "BUILD_EXPIRED",
  "REBUILD_WINDOW_CLOSED",
  "RATE_LIMITED",
  "ACCESS_DENIED",
  "VALIDATION_ERROR",
  "SETUP_FAILED",
  "SHOCK_FAILED",
  "INTERNAL",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiError = z.object({
  code: ErrorCode,
  message: z.string().min(1),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

/** Forma de toda respuesta de error (salvo el 402 de x402). */
export const ErrorResponse = z.object({ error: ApiError });
export type ErrorResponse = z.infer<typeof ErrorResponse>;

/**
 * Fuente única del status HTTP de cada error (ver docs/api-contract.md, "Errores HTTP").
 * Es un Record<ErrorCode, …>: añadir un código sin su entrada no compila.
 * `retryable`: repetir LA MISMA petición más tarde puede funcionar sin cambiar nada
 * (pista para agentes: reintentar con espera, o no).
 */
export const ERROR_HTTP: Record<ErrorCode, { status: number; retryable: boolean }> = {
  PAYMENT_REQUIRED: { status: 402, retryable: false },
  PAYMENT_INVALID: { status: 402, retryable: false },
  BUILD_FAILED: { status: 500, retryable: true },
  BUILD_EXPIRED: { status: 410, retryable: false }, // reservado: el backend no lo emite
  REBUILD_WINDOW_CLOSED: { status: 410, retryable: false },
  RATE_LIMITED: { status: 429, retryable: true },
  ACCESS_DENIED: { status: 403, retryable: false },
  VALIDATION_ERROR: { status: 400, retryable: false },
  SETUP_FAILED: { status: 500, retryable: true }, // normalmente viaja dentro del estado del job
  SHOCK_FAILED: { status: 500, retryable: true }, // ídem
  INTERNAL: { status: 500, retryable: true },
};
