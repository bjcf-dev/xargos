// @vitest-environment node
import { ErrorResponse } from "@xargos/shared";
import { describe, expect, it } from "vitest";
import { createXargosProxy } from "./proxy";

const WEB = "http://web.local/api/xargos";
const BACK = "http://back.local";

type Call = { url: string; method: string; headers: Headers; body: string | undefined };

function bodyText(body: BodyInit | null | undefined): string | undefined {
  if (body == null) return undefined;
  return typeof body === "string" ? body : new TextDecoder().decode(body as ArrayBuffer);
}

/** fetch falso: responde con `respond` y guarda cada petición. */
function fakeFetch(
  respond: (call: Call) => Response | Promise<Response> = () => new Response("{}"),
) {
  const calls: Call[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: bodyText(init?.body),
    };
    calls.push(call);
    return respond(call);
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

describe("createXargosProxy", () => {
  it("forwards GET with query string", async () => {
    const { fetch, calls } = fakeFetch(() => Response.json([{ id: "r1" }]));
    const proxy = createXargosProxy({ backendUrl: BACK, fetch });

    const res = await proxy(new Request(`${WEB}/recipes?x=1`), ["recipes"]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BACK}/recipes?x=1`);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.body).toBeUndefined();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "r1" }]);
  });

  it("forwards POST body as is", async () => {
    const { fetch, calls } = fakeFetch();
    const proxy = createXargosProxy({ backendUrl: BACK, fetch });
    const body = JSON.stringify({ agent: "A", position: "P" });

    await proxy(new Request(`${WEB}/recipes/r1/build`, { method: "POST", body }), [
      "recipes",
      "r1",
      "build",
    ]);

    expect(calls[0]?.url).toBe(`${BACK}/recipes/r1/build`);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.body).toBe(body);
  });

  it("passes through backend status and body", async () => {
    const error = { error: { code: "RATE_LIMITED", message: "Slow down." } };
    const { fetch } = fakeFetch(() => Response.json(error, { status: 429 }));
    const proxy = createXargosProxy({ backendUrl: BACK, fetch });

    const res = await proxy(new Request(`${WEB}/demo/setup/A`), ["demo", "setup", "A"]);

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual(error);
  });

  it.each([
    ["http://back.local/", "http://back.local/recipes"],
    ["http://back.local/api/", "http://back.local/api/recipes"],
    ["http://back.local/api", "http://back.local/api/recipes"],
  ])("joins BACKEND_URL %s", async (backendUrl, expected) => {
    const { fetch, calls } = fakeFetch();
    const proxy = createXargosProxy({ backendUrl, fetch });

    await proxy(new Request(`${WEB}/recipes`), ["recipes"]);

    expect(calls[0]?.url).toBe(expected);
  });

  it("encodes each path segment", async () => {
    const { fetch, calls } = fakeFetch();
    const proxy = createXargosProxy({ backendUrl: BACK, fetch });

    await proxy(new Request(`${WEB}/executions/a%2Fb`), ["executions", "a/b"]);

    expect(calls[0]?.url).toBe(`${BACK}/executions/a%2Fb`);
  });

  it("answers 500 INTERNAL without BACKEND_URL", async () => {
    const { fetch, calls } = fakeFetch();
    const proxy = createXargosProxy({ backendUrl: undefined, fetch });

    const res = await proxy(new Request(`${WEB}/recipes`), ["recipes"]);

    expect(calls).toHaveLength(0);
    expect(res.status).toBe(500);
    expect(ErrorResponse.parse(await res.json()).error.code).toBe("INTERNAL");
  });

  it.each([[["admin"]], [[".."]], [[]]])("rejects unknown root %j", async (path) => {
    const { fetch, calls } = fakeFetch();
    const proxy = createXargosProxy({ backendUrl: BACK, fetch });

    const res = await proxy(new Request(`${WEB}/${path.join("/")}`), path);

    expect(calls).toHaveLength(0);
    expect(res.status).toBe(400);
    expect(ErrorResponse.parse(await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("createXargosProxy headers", () => {
  it("forwards PAYMENT-SIGNATURE to the backend", async () => {
    const { fetch, calls } = fakeFetch();
    const proxy = createXargosProxy({ backendUrl: BACK, fetch });

    await proxy(
      new Request(`${WEB}/recipes/r1/build`, {
        method: "POST",
        body: "{}",
        headers: { "PAYMENT-SIGNATURE": "abc", "Content-Type": "application/json" },
      }),
      ["recipes", "r1", "build"],
    );

    expect(calls[0]?.headers.get("payment-signature")).toBe("abc");
    expect(calls[0]?.headers.get("content-type")).toBe("application/json");
  });

  it("returns PAYMENT-REQUIRED on 402 untouched", async () => {
    const required = "eyJ4NDAyVmVyc2lvbiI6Mn0=";
    const { fetch } = fakeFetch(() =>
      Response.json({}, { status: 402, headers: { "PAYMENT-REQUIRED": required } }),
    );
    const proxy = createXargosProxy({ backendUrl: BACK, fetch });

    const res = await proxy(new Request(`${WEB}/recipes/r1/build`, { method: "POST" }), [
      "recipes",
      "r1",
      "build",
    ]);

    expect(res.status).toBe(402);
    expect(res.headers.get("payment-required")).toBe(required);
    expect(await res.json()).toEqual({});
  });

  it("returns PAYMENT-RESPONSE on success", async () => {
    const { fetch } = fakeFetch(() =>
      Response.json({}, { headers: { "PAYMENT-RESPONSE": "xyz" } }),
    );
    const proxy = createXargosProxy({ backendUrl: BACK, fetch });

    const res = await proxy(new Request(`${WEB}/recipes/r1/build`, { method: "POST" }), [
      "recipes",
      "r1",
      "build",
    ]);

    expect(res.headers.get("payment-response")).toBe("xyz");
  });

  it("does not forward cookies or authorization", async () => {
    const { fetch, calls } = fakeFetch();
    const proxy = createXargosProxy({ backendUrl: BACK, fetch });

    await proxy(
      new Request(`${WEB}/recipes`, { headers: { cookie: "s=1", authorization: "Bearer t" } }),
      ["recipes"],
    );

    expect(calls[0]?.headers.has("cookie")).toBe(false);
    expect(calls[0]?.headers.has("authorization")).toBe(false);
  });

  it("drops content-encoding and content-length from the backend", async () => {
    const { fetch } = fakeFetch(
      () =>
        new Response("{}", {
          headers: {
            "content-type": "application/json",
            "content-encoding": "gzip",
            "content-length": "3",
            "set-cookie": "b=2",
          },
        }),
    );
    const proxy = createXargosProxy({ backendUrl: BACK, fetch });

    const res = await proxy(new Request(`${WEB}/recipes`), ["recipes"]);

    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.has("content-encoding")).toBe(false);
    expect(res.headers.has("content-length")).toBe(false);
    expect(res.headers.has("set-cookie")).toBe(false);
  });
});

describe("createXargosProxy access code", () => {
  const setup = (body: string) => new Request(`${WEB}/demo/setup`, { method: "POST", body });

  it("adds accessCode to POST /demo/setup", async () => {
    const { fetch, calls } = fakeFetch();
    const proxy = createXargosProxy({ backendUrl: BACK, accessCode: "s3cret", fetch });

    await proxy(setup(JSON.stringify({ agent: "A" })), ["demo", "setup"]);

    expect(JSON.parse(calls[0]?.body ?? "")).toEqual({ agent: "A", accessCode: "s3cret" });
  });

  it("lets the server accessCode win over the client one", async () => {
    const { fetch, calls } = fakeFetch();
    const proxy = createXargosProxy({ backendUrl: BACK, accessCode: "s3cret", fetch });

    await proxy(setup(JSON.stringify({ agent: "A", accessCode: "x" })), ["demo", "setup"]);

    expect(JSON.parse(calls[0]?.body ?? "")).toEqual({ agent: "A", accessCode: "s3cret" });
  });

  it("leaves other routes and GET untouched", async () => {
    const { fetch, calls } = fakeFetch();
    const proxy = createXargosProxy({ backendUrl: BACK, accessCode: "s3cret", fetch });
    const body = JSON.stringify({ agent: "A", position: "P" });

    await proxy(new Request(`${WEB}/recipes/r1/build`, { method: "POST", body }), [
      "recipes",
      "r1",
      "build",
    ]);
    await proxy(new Request(`${WEB}/demo/setup/A`), ["demo", "setup", "A"]);

    expect(calls[0]?.body).toBe(body);
    expect(calls[1]?.body).toBeUndefined();
  });

  it("leaves the body untouched without accessCode", async () => {
    const { fetch, calls } = fakeFetch();
    const proxy = createXargosProxy({ backendUrl: BACK, fetch });
    const body = JSON.stringify({ agent: "A" });

    await proxy(setup(body), ["demo", "setup"]);

    expect(calls[0]?.body).toBe(body);
  });

  it("forwards a non-JSON body on /demo/setup as is", async () => {
    const { fetch, calls } = fakeFetch();
    const proxy = createXargosProxy({ backendUrl: BACK, accessCode: "s3cret", fetch });

    await proxy(setup("not json"), ["demo", "setup"]);

    expect(calls[0]?.body).toBe("not json");
  });
});

describe("createXargosProxy backend failures", () => {
  it("answers 500 INTERNAL when the backend is unreachable", async () => {
    const fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof globalThis.fetch;
    const proxy = createXargosProxy({ backendUrl: BACK, fetch });

    const res = await proxy(new Request(`${WEB}/recipes`), ["recipes"]);

    expect(res.status).toBe(500);
    expect(ErrorResponse.parse(await res.json()).error.code).toBe("INTERNAL");
  });

  it("answers 500 INTERNAL when the backend is too slow", async () => {
    const fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof globalThis.fetch;
    const proxy = createXargosProxy({ backendUrl: BACK, fetch, timeoutMs: 20 });

    const res = await proxy(new Request(`${WEB}/recipes`), ["recipes"]);

    expect(res.status).toBe(500);
    const { error } = ErrorResponse.parse(await res.json());
    expect(error.code).toBe("INTERNAL");
    expect(error.message).toMatch(/time/i);
  });
});
