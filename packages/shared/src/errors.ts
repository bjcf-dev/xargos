import { z } from "zod";

/**
 * Códigos de error comunes a backend y frontend.
 * La lista completa del contrato llega en la PR #1 (ver docs/api-contract.md).
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
