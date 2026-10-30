// @vitest-environment node
import { fixtureBuildResponse, fixtureRecipe, fixtureShockConfirmed } from "@xargos/shared";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApiClient } from "@/lib/api/client";
import { ApiClientError } from "@/lib/api/errors";
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
    const { data: build } = await api.build(fixtureRecipe.id, { agent: AGENT, position: AGENT });

    expect(build.recipeId).toBe(fixtureRecipe.id);
    expect(build.steps).toEqual(fixtureBuildResponse.steps);
    // El guard vigila la ATA de USDC del agente, no su wallet (contrato, #36).
    expect(build.guard.watchedAccount).not.toBe(AGENT);
    expect(build.guard.watchedAccount).toBe(fixtureBuildResponse.guard.watchedAccount);
    expect(build.watchAccounts).toEqual([AGENT]);
  });

  it("returns expiry times in the future so the expiry flow can run", async () => {
    useFreshHandlers();
    const now = Date.now();
    const { data: build } = await api.build(fixtureRecipe.id, { agent: AGENT, position: AGENT });

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

  it("rebuilds for free with the same buildId and a new expiry (D19)", async () => {
    useFreshHandlers();
    const { data: first } = await api.build(fixtureRecipe.id, { agent: AGENT, position: AGENT });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.parse(first.expiresAt) + 1_000);
      const { data: again } = await api.build(fixtureRecipe.id, {
        agent: AGENT,
        position: AGENT,
        buildId: first.buildId,
      });

      expect(again.buildId).toBe(first.buildId);
      expect(Date.parse(again.expiresAt)).toBeGreaterThan(Date.parse(first.expiresAt));
      expect(again.rebuildUntil).toBe(first.rebuildUntil);
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers REBUILD_WINDOW_CLOSED once rebuildUntil has passed", async () => {
    useFreshHandlers();
    const { data: first } = await api.build(fixtureRecipe.id, { agent: AGENT, position: AGENT });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.parse(first.rebuildUntil));
      const error = await api
        .build(fixtureRecipe.id, { agent: AGENT, position: AGENT, buildId: first.buildId })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiClientError);
      expect(error).toMatchObject({ code: "REBUILD_WINDOW_CLOSED", status: 410 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a rebuild of an unknown buildId", async () => {
    useFreshHandlers();
    const error = await api
      .build(fixtureRecipe.id, { agent: AGENT, position: AGENT, buildId: "bld_unknown" })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });
});
