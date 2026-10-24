// @vitest-environment node
import {
  fixtureBuildResponse,
  fixtureRecipe,
  fixtureSetupReady,
  fixtureShockConfirmed,
} from "@xargos/shared";
import { describe, expect, it } from "vitest";
import { createApiClient } from "./client";
import { ApiClientError } from "./errors";

const BASE = "http://test.local/api/xargos";
const AGENT = fixtureSetupReady.agent;

type Call = { url: string; method: string; body: unknown };

/** fetch falso: responde con `respond` y guarda cada petición. */
function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return respond(call);
  };
  return { fetch, calls };
}

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  Response.json(body, { status, ...(headers ? { headers } : {}) });

async function catchError(promise: Promise<unknown>): Promise<ApiClientError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiClientError) return e;
    throw e;
  }
  throw new Error("expected the call to throw");
}

describe("createApiClient", () => {
  it("lists recipes from GET /recipes", async () => {
    const { fetch, calls } = fakeFetch(() => json([fixtureRecipe]));
    const api = createApiClient({ fetch, baseUrl: BASE });

    await expect(api.listRecipes()).resolves.toEqual([fixtureRecipe]);
    expect(calls).toEqual([{ url: `${BASE}/recipes`, method: "GET", body: undefined }]);
  });

  it("posts the build request and parses the BuildResponse", async () => {
    const { fetch, calls } = fakeFetch(() => json(fixtureBuildResponse));
    const api = createApiClient({ fetch, baseUrl: BASE });
    const request = { agent: AGENT, position: fixtureSetupReady.position ?? "" };

    await expect(api.build(fixtureRecipe.id, request)).resolves.toEqual(fixtureBuildResponse);
    expect(calls[0]).toEqual({
      url: `${BASE}/recipes/${fixtureRecipe.id}/build`,
      method: "POST",
      body: request,
    });
  });

  it("starts the demo setup (202) and polls its status", async () => {
    const { fetch, calls } = fakeFetch((call) =>
      call.method === "POST" ? json({ agent: AGENT }, 202) : json(fixtureSetupReady),
    );
    const api = createApiClient({ fetch, baseUrl: BASE });

    await expect(api.startSetup({ agent: AGENT })).resolves.toEqual({ agent: AGENT });
    await expect(api.getSetupStatus(AGENT)).resolves.toEqual(fixtureSetupReady);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${BASE}/demo/setup`,
      `GET ${BASE}/demo/setup/${AGENT}`,
    ]);
  });

  it("starts a price shock (202) and reads its status", async () => {
    const { fetch } = fakeFetch((call) =>
      call.method === "POST"
        ? json({ shockId: fixtureShockConfirmed.shockId }, 202)
        : json(fixtureShockConfirmed),
    );
    const api = createApiClient({ fetch, baseUrl: BASE });

    await expect(api.startPriceShock({ agent: AGENT })).resolves.toEqual({
      shockId: fixtureShockConfirmed.shockId,
    });
    await expect(api.getPriceShockStatus(fixtureShockConfirmed.shockId)).resolves.toEqual(
      fixtureShockConfirmed,
    );
  });

  it("throws the backend error code from an { error } body", async () => {
    const { fetch } = fakeFetch(() =>
      json({ error: { code: "RATE_LIMITED", message: "Too many setups" } }, 429),
    );
    const api = createApiClient({ fetch, baseUrl: BASE });

    const error = await catchError(api.startSetup({ agent: AGENT }));
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.status).toBe(429);
    expect(error.message).toBe("Too many setups");
  });

  it("maps a bare 402 to PAYMENT_REQUIRED and keeps the x402 header", async () => {
    const { fetch } = fakeFetch(() =>
      json({}, 402, { "PAYMENT-REQUIRED": "eyJ4NDAyIjoidGVzdCJ9" }),
    );
    const api = createApiClient({ fetch, baseUrl: BASE });

    const error = await catchError(api.build(fixtureRecipe.id, { agent: AGENT, position: AGENT }));
    expect(error.code).toBe("PAYMENT_REQUIRED");
    expect(error.status).toBe(402);
    expect(error.paymentRequired).toBe("eyJ4NDAyIjoidGVzdCJ9");
  });

  it("keeps PAYMENT_INVALID when a 402 carries an error body", async () => {
    const { fetch } = fakeFetch(() =>
      json({ error: { code: "PAYMENT_INVALID", message: "Insufficient amount" } }, 402),
    );
    const api = createApiClient({ fetch, baseUrl: BASE });

    const error = await catchError(api.build(fixtureRecipe.id, { agent: AGENT, position: AGENT }));
    expect(error.code).toBe("PAYMENT_INVALID");
  });

  it("rejects a 2xx body that does not match the contract as INTERNAL", async () => {
    const { fetch } = fakeFetch(() => json([{ id: "" }]));
    const api = createApiClient({ fetch, baseUrl: BASE });

    const error = await catchError(api.listRecipes());
    expect(error.code).toBe("INTERNAL");
    expect(error.status).toBe(200);
  });

  it("maps an error status without a valid { error } body to INTERNAL", async () => {
    const { fetch } = fakeFetch(() => new Response("<html>Bad gateway</html>", { status: 502 }));
    const api = createApiClient({ fetch, baseUrl: BASE });

    const error = await catchError(api.listRecipes());
    expect(error.code).toBe("INTERNAL");
    expect(error.status).toBe(502);
  });

  it("maps a network failure to INTERNAL with no status", async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    const api = createApiClient({ fetch, baseUrl: BASE });

    const error = await catchError(api.listRecipes());
    expect(error.code).toBe("INTERNAL");
    expect(error.status).toBeUndefined();
  });

  it("uses /api/xargos as the default base URL", async () => {
    const { fetch, calls } = fakeFetch(() => json([fixtureRecipe]));
    const api = createApiClient({ fetch });

    await api.listRecipes();
    expect(calls[0]?.url).toBe("/api/xargos/recipes");
  });
});
