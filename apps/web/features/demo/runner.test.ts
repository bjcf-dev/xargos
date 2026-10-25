// @vitest-environment node
import { fixtureBuildResponse, fixtureRecipe, fixtureSetupReady } from "@xargos/shared";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApiClient } from "@/lib/api/client";
import { createHandlers } from "@/mocks/handlers";
import { createMockSigner } from "./mock-signer";
import { type RunnerDeps, runPay, runSetup, runShock, runSign } from "./runner";
import type { DemoEvent, Run } from "./types";

const AGENT = fixtureSetupReady.agent;
const POSITION = fixtureSetupReady.position ?? "";
const server = setupServer();
const deps: RunnerDeps = {
  api: createApiClient({ baseUrl: "http://localhost/api/xargos" }),
  signer: createMockSigner({ latencyMs: 0 }),
  recipeId: fixtureRecipe.id,
  pollIntervalMs: 1,
};

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() => server.resetHandlers(...createHandlers()));
afterAll(() => server.close());

/** Guarda los eventos despachados para comprobar su secuencia. */
function recorder() {
  const events: DemoEvent[] = [];
  return { events, dispatch: (event: DemoEvent) => events.push(event) };
}
const live = () => new AbortController().signal;

describe("runner", () => {
  it("starts the setup and reports every phase until ready", async () => {
    const { events, dispatch } = recorder();
    await runSetup(deps, AGENT, dispatch, live());

    expect(events[0]).toEqual({ type: "SETUP_STARTED", agent: AGENT });
    const phases = events.slice(1).map((e) => e.type === "SETUP_PROGRESS" && e.setup.phase);
    expect(phases).toEqual(["queued", "funding_sol", "funding_usdc", "opening_position", "ready"]);
  });

  it("pays and builds", async () => {
    const { events, dispatch } = recorder();
    await runPay(deps, AGENT, POSITION, dispatch, live());

    expect(events.map((e) => e.type)).toEqual(["PAY", "BUILT"]);
    expect(events[1]).toMatchObject({ build: { recipeId: fixtureRecipe.id } });
  });

  it("requests the price shock and follows it until confirmed", async () => {
    const { events, dispatch } = recorder();
    await runShock(deps, AGENT, dispatch, live());

    expect(events).toMatchObject([
      { type: "SHOCK_REQUESTED" },
      { type: "SHOCK_ACCEPTED", shockId: "shk_mock_1" },
      { type: "SHOCK_SETTLED", shock: { status: "pending" } },
      { type: "SHOCK_SETTLED", shock: { status: "confirmed" } },
    ]);
  });

  it("signs with the injected signer", async () => {
    const { events, dispatch } = recorder();
    const run: Run = { agent: AGENT, position: POSITION, build: fixtureBuildResponse };
    await runSign(deps, run, dispatch, live());

    expect(events.map((e) => e.type)).toEqual(["SIGN", "CONFIRMED"]);
  });

  it("turns an API error into FAILED with the contract code", async () => {
    server.use(
      http.post("*/api/xargos/recipes/:id/build", () =>
        HttpResponse.json(
          { error: { code: "RATE_LIMITED", message: "Too many builds" } },
          { status: 429 },
        ),
      ),
    );
    const { events, dispatch } = recorder();
    await runPay(deps, AGENT, POSITION, dispatch, live());

    expect(events).toEqual([
      { type: "PAY" },
      { type: "FAILED", error: { code: "RATE_LIMITED", message: "Too many builds" } },
    ]);
  });

  it("dispatches nothing more once aborted", async () => {
    const controller = new AbortController();
    const events: DemoEvent[] = [];
    const dispatch = (event: DemoEvent) => {
      events.push(event);
      if (event.type === "SETUP_PROGRESS") controller.abort();
    };
    await runSetup(deps, AGENT, dispatch, controller.signal);

    expect(events.map((e) => e.type)).toEqual(["SETUP_STARTED", "SETUP_PROGRESS"]);
  });
});
