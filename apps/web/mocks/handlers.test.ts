// @vitest-environment node
import { fixtureBuildResponse, fixtureRecipe, fixtureShockConfirmed } from "@xargos/shared";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApiClient } from "@/lib/api/client";
import { pollUntil } from "@/lib/api/poll";
import { createHandlers } from "./handlers";

// Agente distinto del de las fixtures: el keypair real se genera en el navegador.
const AGENT = "BrowserAgent111111111111111111111111111111";

const server = setupServer();
const api = createApiClient({ baseUrl: "http://localhost/api/xargos" });

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** Estado del mock nuevo en cada test. */
function useFreshHandlers() {
  server.resetHandlers(...createHandlers());
}

describe("mock handlers", () => {
  it("serves the recipe list", async () => {
    useFreshHandlers();
    await expect(api.listRecipes()).resolves.toEqual([fixtureRecipe]);
  });

  it("builds without payment in mock mode, for the requesting agent", async () => {
    useFreshHandlers();
    const build = await api.build(fixtureRecipe.id, { agent: AGENT, position: AGENT });

    expect(build.recipeId).toBe(fixtureRecipe.id);
    expect(build.steps).toEqual(fixtureBuildResponse.steps);
    expect(build.guard.watchedAccount).toBe(AGENT);
    expect(build.watchAccounts).toEqual([AGENT]);
  });

  it("returns expiry times in the future so the expiry flow can run", async () => {
    useFreshHandlers();
    const now = Date.now();
    const build = await api.build(fixtureRecipe.id, { agent: AGENT, position: AGENT });

    expect(Date.parse(build.expiresAt)).toBeGreaterThan(now);
    expect(Date.parse(build.rebuildUntil)).toBeGreaterThan(Date.parse(build.expiresAt));
  });

  it("rejects an unknown recipe with VALIDATION_ERROR", async () => {
    useFreshHandlers();
    await expect(api.build("nope", { agent: AGENT, position: AGENT })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
    });
  });

  it("walks the demo setup through every phase until ready", async () => {
    useFreshHandlers();
    await expect(api.startSetup({ agent: AGENT })).resolves.toEqual({ agent: AGENT });

    const phases: string[] = [];
    const ready = await pollUntil(
      async () => {
        const status = await api.getSetupStatus(AGENT);
        phases.push(status.phase);
        return status;
      },
      (s) => s.phase === "ready",
      { intervalMs: 1 },
    );

    expect(phases).toEqual(["queued", "funding_sol", "funding_usdc", "opening_position", "ready"]);
    expect(ready.agent).toBe(AGENT);
    expect(ready.position).toBeDefined();
    expect(ready.balances).toBeDefined();
  });

  it("answers a setup status for an agent that never started with VALIDATION_ERROR", async () => {
    useFreshHandlers();
    await expect(api.getSetupStatus(AGENT)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("surfaces a 402 with its PAYMENT-REQUIRED header intact", async () => {
    useFreshHandlers();
    server.use(
      http.post(
        "*/api/xargos/recipes/:recipeId/build",
        () => new HttpResponse(null, { status: 402, headers: { "PAYMENT-REQUIRED": "x402-req" } }),
      ),
    );

    await expect(
      api.build(fixtureRecipe.id, { agent: AGENT, position: AGENT }),
    ).rejects.toMatchObject({ code: "PAYMENT_REQUIRED", status: 402, paymentRequired: "x402-req" });
  });

  it.each([
    [429, "RATE_LIMITED"],
    [403, "ACCESS_DENIED"],
  ] as const)("maps a %i setup rejection to %s", async (status, code) => {
    useFreshHandlers();
    server.use(
      http.post("*/api/xargos/demo/setup", () =>
        HttpResponse.json({ error: { code, message: "Rejected" } }, { status }),
      ),
    );

    await expect(api.startSetup({ agent: AGENT })).rejects.toMatchObject({ code, status });
  });

  it("confirms a price shock after a pending poll", async () => {
    useFreshHandlers();
    const { shockId } = await api.startPriceShock({ agent: AGENT });

    const first = await api.getPriceShockStatus(shockId);
    const second = await api.getPriceShockStatus(shockId);

    expect(first.status).toBe("pending");
    expect(second).toEqual({ ...fixtureShockConfirmed, shockId });
  });
});
