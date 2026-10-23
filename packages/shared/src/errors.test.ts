import { describe, expect, it } from "vitest";
import { ErrorResponse } from "./index.js";

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
