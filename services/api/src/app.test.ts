import { ErrorResponse } from "@xargos/shared";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import type { SetupSteps } from "./demo/setup-runner";

function app(routes = new Hono(), overrides: Partial<Parameters<typeof createApp>[0]> = {}) {
  return createApp({
    recipeRoutes: routes,
    shockRoutes: new Hono(),
    steps: {} as SetupSteps,
    setupRateLimitPerHour: 10,
    setupMaxJobs: 10,
    ...overrides,
  });
}
const code = async (res: Response) => ErrorResponse.parse(await res.json()).error.code;

describe("createApp", () => {
  it("answers an unknown route with the contract's shape", async () => {
    const res = await app().request("/nope");
    expect(res.status).toBe(404);
    expect(await code(res)).toBe("NOT_FOUND");
  });

  it("answers an unhandled exception with INTERNAL, not plain text, and logs the cause", async () => {
    const routes = new Hono();
    routes.get("/boom", () => {
      throw new Error("rpc down");
    });
    const log = { error: vi.fn() };
    const res = await app(routes, { log }).request("/boom");
    expect(res.status).toBe(500);
    expect(await code(res)).toBe("INTERNAL");
    expect(log.error).toHaveBeenCalledOnce();
  });

  it("refuses a huge body", async () => {
    const res = await app().request("/demo/setup", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "20000" },
      body: "x".repeat(20_000),
    });
    expect(res.status).toBe(400);
    expect(await code(res)).toBe("VALIDATION_ERROR");
  });

  it("reports the payer's balances in /health", async () => {
    const funds = { read: async () => ({ sol: "1", usdc: "2" }), enough: async () => true };
    const res = await app(new Hono(), { funds }).request("/health");
    expect(await res.json()).toEqual({ ok: true, payer: { sol: "1", usdc: "2" } });
  });

  it("stays healthy without knowing the balances, so Railway does not restart it", async () => {
    const funds = { read: async () => null, enough: async () => true };
    const res = await app(new Hono(), { funds }).request("/health");
    expect(res.status).toBe(200);
  });
});
