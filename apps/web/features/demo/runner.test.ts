// @vitest-environment node
import {
  fixtureBuildResponse,
  fixtureRecipe,
  fixtureSetupFailed,
  fixtureSetupReady,
  fixtureShockConfirmed,
} from "@xargos/shared";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type ApiClient, createApiClient } from "@/lib/api/client";
import { createHandlers } from "@/mocks/handlers";
import { createMockSigner } from "./mock-signer";
import { type RunnerDeps, runPay, runRebuild, runSetup, runShock, runSign } from "./runner";
import type { DemoSigner } from "./signer";
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
beforeEach(() => {
  server.events.removeAllListeners();
  server.resetHandlers(...createHandlers());
});
afterAll(() => server.close());

/** Guarda los eventos despachados para comprobar su secuencia. */
function recorder() {
  const events: DemoEvent[] = [];
  return { events, dispatch: (event: DemoEvent) => events.push(event) };
}
const live = () => new AbortController().signal;

/** Cuenta los POST /demo/setup que llegan al mock a partir de ahora. */
function countSetupPosts() {
  let count = 0;
  server.events.on("request:start", ({ request }) => {
    if (request.method === "POST" && request.url.endsWith("/demo/setup")) count += 1;
  });
  return () => count;
}

describe("runner", () => {
  it("starts the setup and reports every phase until ready", async () => {
    const { events, dispatch } = recorder();
    await runSetup(deps, AGENT, dispatch, live());

    expect(events[0]).toEqual({ type: "SETUP_STARTED", agent: AGENT });
    const phases = events.slice(1).map((e) => e.type === "SETUP_PROGRESS" && e.setup.phase);
    expect(phases).toEqual(["queued", "funding_sol", "funding_usdc", "opening_position", "ready"]);
  });

  it("resumes a known agent without POST", async () => {
    const posts = countSetupPosts();
    server.use(
      http.get("http://localhost/api/xargos/demo/setup/:agent", () =>
        HttpResponse.json(fixtureSetupReady),
      ),
    );
    const { events, dispatch } = recorder();
    await runSetup(deps, AGENT, dispatch, live());
    expect(posts()).toBe(0);
    expect(events.at(-1)).toEqual({ type: "SETUP_PROGRESS", setup: fixtureSetupReady });
  });

  it("posts again when the agent is unknown", async () => {
    const posts = countSetupPosts();
    await runSetup(deps, AGENT, recorder().dispatch, live());
    expect(posts()).toBe(1);
  });

  it("posts again when the job failed", async () => {
    const posts = countSetupPosts();
    let first = true;
    server.use(
      http.get("http://localhost/api/xargos/demo/setup/:agent", () => {
        if (!first) return HttpResponse.json(fixtureSetupReady);
        first = false;
        return HttpResponse.json(fixtureSetupFailed);
      }),
    );
    await runSetup(deps, AGENT, recorder().dispatch, live());
    expect(posts()).toBe(1);
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

  it("tells the signer which mint the recipe is paid with", async () => {
    const contexts: unknown[] = [];
    const signer: DemoSigner = async (_run, _signal, context) => {
      contexts.push(context);
      return { outcome: "confirmed", signature: "sig" };
    };
    const run: Run = { agent: AGENT, position: POSITION, build: fixtureBuildResponse };
    const paymentMint = fixtureRecipe.price.mint;
    await runSign({ ...deps, signer, paymentMint }, run, recorder().dispatch, live());

    expect(contexts).toEqual([{ paymentMint }]);
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
      {
        type: "FAILED",
        error: { code: "RATE_LIMITED", message: "Too many builds", rejected: true },
      },
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

  it("passes the Retry-After wait of a rate-limited build to the error", async () => {
    server.use(
      http.post("*/api/xargos/recipes/:id/build", () =>
        HttpResponse.json(
          { error: { code: "RATE_LIMITED", message: "Slow down" } },
          { status: 429, headers: { "retry-after": "20" } },
        ),
      ),
    );
    const { events, dispatch } = recorder();
    await runPay(deps, AGENT, POSITION, dispatch, live());

    expect(events.at(-1)).toEqual({
      type: "FAILED",
      error: { code: "RATE_LIMITED", message: "Slow down", retryAfterSeconds: 20, rejected: true },
    });
  });

  it("flags an unreachable backend in the error", async () => {
    server.use(http.post("*/api/xargos/recipes/:id/build", () => HttpResponse.error()));
    const { events, dispatch } = recorder();
    await runPay(deps, AGENT, POSITION, dispatch, live());

    expect(events.at(-1)).toEqual({
      type: "FAILED",
      error: { code: "INTERNAL", message: "Network error", unreachable: true },
    });
  });

  it("rebuilds an expired run with its buildId and keeps the run", async () => {
    let body: unknown;
    server.use(
      http.post("*/api/xargos/recipes/:id/build", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(fixtureBuildResponse);
      }),
    );
    const run: Run = { agent: AGENT, position: POSITION, build: fixtureBuildResponse };
    const now = Date.parse(fixtureBuildResponse.rebuildUntil) - 1_000;
    const { events, dispatch } = recorder();
    await runRebuild(deps, run, dispatch, live(), now);

    expect(body).toEqual({ agent: AGENT, position: POSITION, buildId: run.build.buildId });
    expect(events).toEqual([
      { type: "REBUILD", now },
      { type: "BUILT", build: fixtureBuildResponse },
    ]);
  });

  it("does not call the API once the free rebuild window has closed", async () => {
    let calls = 0;
    server.use(
      http.post("*/api/xargos/recipes/:id/build", () => {
        calls += 1;
        return HttpResponse.json(fixtureBuildResponse);
      }),
    );
    const run: Run = { agent: AGENT, position: POSITION, build: fixtureBuildResponse };
    const now = Date.parse(fixtureBuildResponse.rebuildUntil);
    const { events, dispatch } = recorder();
    await runRebuild(deps, run, dispatch, live(), now);

    // El reducer convierte este REBUILD en REBUILD_WINDOW_CLOSED.
    expect(events).toEqual([{ type: "REBUILD", now }]);
    expect(calls).toBe(0);
  });
});

// El firmante real (F6) no está obligado a rechazar al abortar: lo que resuelva tarde no se despacha.
describe("runner with work that ignores the abort", () => {
  /** Aborta y aun así resuelve, como una llamada que no respeta la señal. */
  function abortsThenResolves<T>(controller: AbortController, value: T) {
    return async () => {
      controller.abort();
      return value;
    };
  }

  it("drops a setup status that resolves after the abort", async () => {
    const controller = new AbortController();
    const api: ApiClient = {
      ...deps.api,
      startSetup: async () => ({ agent: AGENT }),
      getSetupStatus: abortsThenResolves(controller, fixtureSetupReady),
    };
    const { events, dispatch } = recorder();
    await runSetup({ ...deps, api }, AGENT, dispatch, controller.signal);

    expect(events.map((e) => e.type)).toEqual(["SETUP_STARTED"]);
  });

  it("drops a build that resolves after the abort", async () => {
    const controller = new AbortController();
    const api: ApiClient = {
      ...deps.api,
      build: abortsThenResolves(controller, { data: fixtureBuildResponse }),
    };
    const { events, dispatch } = recorder();
    await runPay({ ...deps, api }, AGENT, POSITION, dispatch, controller.signal);

    expect(events.map((e) => e.type)).toEqual(["PAY"]);
  });

  it("drops an accepted shock that resolves after the abort", async () => {
    const controller = new AbortController();
    const api: ApiClient = {
      ...deps.api,
      startPriceShock: abortsThenResolves(controller, { shockId: "shk_late" }),
    };
    const { events, dispatch } = recorder();
    await runShock({ ...deps, api }, AGENT, dispatch, controller.signal);

    expect(events.map((e) => e.type)).toEqual(["SHOCK_REQUESTED"]);
  });

  it("drops a shock status that resolves after the abort", async () => {
    const controller = new AbortController();
    const api: ApiClient = {
      ...deps.api,
      startPriceShock: async () => ({ shockId: "shk_late" }),
      getPriceShockStatus: abortsThenResolves(controller, fixtureShockConfirmed),
    };
    const { events, dispatch } = recorder();
    await runShock({ ...deps, api }, AGENT, dispatch, controller.signal);

    expect(events.map((e) => e.type)).toEqual(["SHOCK_REQUESTED", "SHOCK_ACCEPTED"]);
  });

  it("drops a signature that resolves after the abort", async () => {
    const controller = new AbortController();
    const signer: DemoSigner = abortsThenResolves(controller, {
      outcome: "confirmed",
      signature: "late",
    });
    const run: Run = { agent: AGENT, position: POSITION, build: fixtureBuildResponse };
    const { events, dispatch } = recorder();
    await runSign({ ...deps, signer }, run, dispatch, controller.signal);

    expect(events.map((e) => e.type)).toEqual(["SIGN"]);
  });
});
