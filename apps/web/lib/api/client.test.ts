// @vitest-environment node
import {
  fixtureBuildResponse,
  fixtureRecipe,
  fixtureSetupReady,
  fixtureShockConfirmed,
} from "@xargos/shared";
import { describe, expect, it } from "vitest";
import { createApiClient, parseRetryAfter } from "./client";
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

    await expect(api.build(fixtureRecipe.id, request)).resolves.toEqual({
      data: fixtureBuildResponse,
    });
    expect(calls[0]).toEqual({
      url: `${BASE}/recipes/${fixtureRecipe.id}/build`,
      method: "POST",
      body: request,
    });
  });

  it("returns the x402 PAYMENT-RESPONSE receipt untouched with the build", async () => {
    const receipt = "eyJzdWNjZXNzIjp0cnVlfQ";
    const { fetch } = fakeFetch(() =>
      json(fixtureBuildResponse, 200, { "PAYMENT-RESPONSE": receipt }),
    );
    const api = createApiClient({ fetch, baseUrl: BASE });

    await expect(api.build(fixtureRecipe.id, { agent: AGENT, position: AGENT })).resolves.toEqual({
      data: fixtureBuildResponse,
      paymentResponse: receipt,
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

  it("uses the global fetch installed at call time, not at creation time", async () => {
    // Herramientas como MSW sustituyen globalThis.fetch después de crear el cliente.
    const api = createApiClient({ baseUrl: BASE });
    const original = globalThis.fetch;
    const { fetch, calls } = fakeFetch(() => json([fixtureRecipe]));
    globalThis.fetch = fetch as typeof globalThis.fetch;
    try {
      await expect(api.listRecipes()).resolves.toEqual([fixtureRecipe]);
      expect(calls).toHaveLength(1);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("passes the signal to fetch and rejects with AbortError when aborted", async () => {
    // Como el fetch real: la petición queda en vuelo hasta que se cancela su señal.
    const fetch = (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const api = createApiClient({ fetch, baseUrl: BASE });
    const controller = new AbortController();

    const promise = api.getSetupStatus(AGENT, { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reads the Retry-After wait of a 429", async () => {
    const { fetch } = fakeFetch(() =>
      json({ error: { code: "RATE_LIMITED", message: "Too many setups" } }, 429, {
        "retry-after": "30",
      }),
    );
    const api = createApiClient({ fetch, baseUrl: BASE });

    const error = await catchError(api.startSetup({ agent: AGENT }));
    expect(error.retryAfterSeconds).toBe(30);
    expect(error.unreachable).toBe(false);
  });

  it("marks a network failure as an unreachable backend", async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    const api = createApiClient({ fetch, baseUrl: BASE });

    const error = await catchError(api.listRecipes());
    expect(error.unreachable).toBe(true);
  });

  it.each([502, 503, 504])("marks a %i without a contract body as unreachable", async (status) => {
    const { fetch } = fakeFetch(() => new Response("<html>Bad gateway</html>", { status }));
    const api = createApiClient({ fetch, baseUrl: BASE });

    const error = await catchError(api.listRecipes());
    expect(error.code).toBe("INTERNAL");
    expect(error.unreachable).toBe(true);
  });

  it("keeps the contract code of a 502 with a contract body", async () => {
    const { fetch } = fakeFetch(() =>
      json({ error: { code: "BUILD_FAILED", message: "Simulation failed" } }, 502),
    );
    const api = createApiClient({ fetch, baseUrl: BASE });

    const error = await catchError(api.listRecipes());
    expect(error.code).toBe("BUILD_FAILED");
    expect(error.unreachable).toBe(false);
  });

  it("does not take a contract INTERNAL 500 for an unreachable backend", async () => {
    const { fetch } = fakeFetch(() => json({ error: { code: "INTERNAL", message: "Oops" } }, 500));
    const api = createApiClient({ fetch, baseUrl: BASE });

    const error = await catchError(api.listRecipes());
    expect(error.unreachable).toBe(false);
  });

  it("takes a 429 without a contract body (platform limit) as RATE_LIMITED with its wait", async () => {
    const { fetch } = fakeFetch(
      () => new Response("Too Many Requests", { status: 429, headers: { "retry-after": "15" } }),
    );
    const api = createApiClient({ fetch, baseUrl: BASE });

    const error = await catchError(api.listRecipes());
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(15);
  });

  it("marks a contract error as rejected: the backend answered, so x402 did not settle", async () => {
    const { fetch } = fakeFetch(() =>
      json({ error: { code: "BUILD_FAILED", message: "Simulation failed" } }, 500),
    );
    const api = createApiClient({ fetch, baseUrl: BASE });

    const error = await catchError(api.build(fixtureRecipe.id, { agent: AGENT, position: AGENT }));
    expect(error.rejected).toBe(true);
  });

  it("does not mark as rejected what the backend may not have answered", async () => {
    const cases: Array<() => Response> = [
      () => {
        throw new TypeError("fetch failed");
      },
      () => new Response("<html>Gateway timeout</html>", { status: 504 }),
      () => json([{ id: "" }]),
    ];
    for (const respond of cases) {
      const api = createApiClient({ fetch: fakeFetch(respond).fetch, baseUrl: BASE });
      const error = await catchError(api.listRecipes());
      expect(error.rejected).toBe(false);
    }
  });

  it("builds through the paying fetch when one is given (F8)", async () => {
    const plain = fakeFetch(() => json({}, 500));
    const paying = fakeFetch(() => json(fixtureBuildResponse));
    const api = createApiClient({ baseUrl: BASE, fetch: plain.fetch });

    await api.build(fixtureRecipe.id, { agent: AGENT, position: "P" }, { pay: paying.fetch });

    expect(paying.calls).toHaveLength(1);
    expect(paying.calls[0]?.url).toBe(`${BASE}/recipes/${fixtureRecipe.id}/build`);
    expect(plain.calls).toHaveLength(0);
  });

  it("keeps the error of a payment the agent refused, instead of a network error", async () => {
    const refused = new ApiClientError("PAYMENT_INVALID", "The agent did not pay: too much", {
      rejected: true,
    });
    const api = createApiClient({ baseUrl: BASE });
    const pay = async () => {
      throw refused;
    };

    const error = await catchError(
      api.build(fixtureRecipe.id, { agent: AGENT, position: "P" }, { pay }),
    );

    expect(error).toBe(refused);
  });

  it("uses /api/xargos as the default base URL", async () => {
    const { fetch, calls } = fakeFetch(() => json([fixtureRecipe]));
    const api = createApiClient({ fetch });

    await api.listRecipes();
    expect(calls[0]?.url).toBe("/api/xargos/recipes");
  });
});

describe("parseRetryAfter", () => {
  const NOW = Date.parse("2026-10-29T18:00:00Z");

  it("reads whole seconds", () => {
    expect(parseRetryAfter("12", NOW)).toBe(12);
    expect(parseRetryAfter("0", NOW)).toBe(0);
  });

  it("reads an HTTP date as the seconds until then, never below zero", () => {
    expect(parseRetryAfter(new Date(NOW + 90_000).toUTCString(), NOW)).toBe(90);
    expect(parseRetryAfter(new Date(NOW - 5_000).toUTCString(), NOW)).toBe(0);
  });

  it("gives no wait for a missing, empty, negative or unreadable value", () => {
    for (const value of [null, "", " ", "-3", "1.5", "soon"]) {
      expect(parseRetryAfter(value, NOW)).toBeUndefined();
    }
  });
});
