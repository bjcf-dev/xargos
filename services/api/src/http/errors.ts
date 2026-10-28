import { ERROR_HTTP, type ErrorCode } from "@xargos/shared";
import type { Context } from "hono";

/** The one shape of every error response; the HTTP status comes from the shared table. */
export function errorResponse(c: Context, code: ErrorCode, message: string) {
  const { status, retryable } = ERROR_HTTP[code];
  return c.json({ error: { code, message, details: { retryable } } }, status as 400);
}
