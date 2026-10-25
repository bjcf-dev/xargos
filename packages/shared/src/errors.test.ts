import { describe, expect, it } from "vitest";
import { ERROR_HTTP, ErrorCode, ErrorResponse } from "./index";

describe("ErrorResponse", () => {
  it("acepta un error válido del contrato", () => {
    const parsed = ErrorResponse.parse({
      error: { code: "BUILD_FAILED", message: "Simulation failed before settlement" },
    });
    expect(parsed.error.code).toBe("BUILD_FAILED");
  });

  it("rechaza un código que no está en el contrato", () => {
    const result = ErrorResponse.safeParse({ error: { code: "NOPE", message: "x" } });
    expect(result.success).toBe(false);
  });
});

describe("ERROR_HTTP", () => {
  it("has an entry for every error code", () => {
    expect(Object.keys(ERROR_HTTP).sort()).toEqual([...ErrorCode.options].sort());
  });

  // x402 only skips the charge when the response is >= 400: an error answered with 2xx would bill the agent.
  it.each(ErrorCode.options)("%s is never answered with a 2xx/3xx", (code) => {
    expect(ERROR_HTTP[code].status).toBeGreaterThanOrEqual(400);
  });

  it.each([
    ["PAYMENT_REQUIRED", 402],
    ["PAYMENT_INVALID", 402],
    ["VALIDATION_ERROR", 400],
    ["ACCESS_DENIED", 403],
    ["REBUILD_WINDOW_CLOSED", 410],
    ["RATE_LIMITED", 429],
    ["BUILD_FAILED", 500],
    ["INTERNAL", 500],
  ] as const)("%s answers %i", (code, status) => {
    expect(ERROR_HTTP[code].status).toBe(status);
  });
});
