// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRpcProxy, DEVNET_GENESIS_HASH } from "./rpc-proxy";

const UPSTREAM = "https://rpc.example/?api-key=secret-value";

type Call = { url: string; body: string };

function fakeFetch({
  genesis = DEVNET_GENESIS_HASH as string | string[],
  answer = { result: "ok" },
  fail = false,
} = {}) {
  const calls: Call[] = [];
  // Con una lista, cada consulta del genesis contesta el siguiente valor.
  const geneses = Array.isArray(genesis) ? [...genesis] : null;
  const fetch = (async (url: string, init: RequestInit) => {
    const body = String(init.body);
    calls.push({ url, body });
    if (body.includes("getGenesisHash")) {
      const result = geneses ? geneses.shift() : genesis;
      return Response.json({ jsonrpc: "2.0", id: 0, result });
    }
    if (fail) throw new Error(`connect ECONNREFUSED ${url}`);
    return Response.json({ jsonrpc: "2.0", id: 1, ...answer });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const rpcRequest = (body: unknown, ip?: string) =>
  new Request("http://localhost/api/xargos/rpc", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(ip ? { "x-nf-client-connection-ip": ip } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const call = (method: string) => ({ jsonrpc: "2.0", id: 1, method, params: [] });

describe("createRpcProxy", () => {
  it("forwards an allowed method and returns the upstream body", async () => {
    const { fetch, calls } = fakeFetch();
    const proxy = createRpcProxy({ upstreamUrl: UPSTREAM, fetch });
    const response = await proxy(rpcRequest(call("getSignatureStatuses")));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 1, result: "ok" });
    expect(calls.at(-1)?.body).toContain("getSignatureStatuses");
  });

  // El firmante lee las cuentas del agente antes de simular para comparar.
  it("forwards getMultipleAccounts", async () => {
    const { fetch, calls } = fakeFetch();
    const response = await createRpcProxy({ upstreamUrl: UPSTREAM, fetch })(
      rpcRequest(call("getMultipleAccounts")),
    );
    expect(response.status).toBe(200);
    expect(calls.at(-1)?.body).toContain("getMultipleAccounts");
  });

  // El cliente x402 (F8) lee el mint del pago (decimales y programa) antes de firmar.
  it("forwards getAccountInfo", async () => {
    const { fetch, calls } = fakeFetch();
    const response = await createRpcProxy({ upstreamUrl: UPSTREAM, fetch })(
      rpcRequest(call("getAccountInfo")),
    );
    expect(response.status).toBe(200);
    expect(calls.at(-1)?.body).toContain("getAccountInfo");
  });

  it("rejects a method outside the list", async () => {
    const { fetch, calls } = fakeFetch();
    const response = await createRpcProxy({ upstreamUrl: UPSTREAM, fetch })(
      rpcRequest(call("requestAirdrop")),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ jsonrpc: "2.0", id: 1, error: { code: -32601 } });
    expect(calls).toHaveLength(0);
  });

  it("forwards the checked request, never the original text", async () => {
    const { fetch, calls } = fakeFetch();
    // JSON.parse se queda con la última clave; un RPC que tomara la primera se saltaría la lista.
    const duplicated =
      '{"jsonrpc":"2.0","id":7,"method":"requestAirdrop","method":"getTransaction","params":["sig"],"extra":true}';
    const response = await createRpcProxy({ upstreamUrl: UPSTREAM, fetch })(rpcRequest(duplicated));
    expect(response.status).toBe(200);
    expect(calls.at(-1)?.body).toBe(
      JSON.stringify({ jsonrpc: "2.0", id: 7, method: "getTransaction", params: ["sig"] }),
    );
  });

  it("rejects a batch", async () => {
    const { fetch } = fakeFetch();
    const response = await createRpcProxy({ upstreamUrl: UPSTREAM, fetch })(
      rpcRequest([call("getTransaction")]),
    );
    expect(response.status).toBe(400);
  });

  it.each(["1", "null", '"getTransaction"'])(
    "rejects a body that is not an object: %s",
    async (body) => {
      const { fetch, calls } = fakeFetch();
      const response = await createRpcProxy({ upstreamUrl: UPSTREAM, fetch })(rpcRequest(body));
      expect(response.status).toBe(400);
      expect(calls).toHaveLength(0);
    },
  );

  it("rejects an id that is not a string, a number or null", async () => {
    const { fetch, calls } = fakeFetch();
    const response = await createRpcProxy({ upstreamUrl: UPSTREAM, fetch })(
      rpcRequest({ ...call("getTransaction"), id: { nested: true } }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ id: null, error: { code: -32600 } });
    expect(calls).toHaveLength(0);
  });

  it("only accepts POST", async () => {
    const { fetch, calls } = fakeFetch();
    const response = await createRpcProxy({ upstreamUrl: UPSTREAM, fetch })(
      new Request("http://localhost/api/xargos/rpc", { method: "GET" }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(calls).toHaveLength(0);
  });

  it("rejects a body over 64 KB", async () => {
    const { fetch, calls } = fakeFetch();
    const big = { ...call("sendTransaction"), params: ["x".repeat(65 * 1024)] };
    const response = await createRpcProxy({ upstreamUrl: UPSTREAM, fetch })(rpcRequest(big));
    expect(response.status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it("refuses to forward when the genesis is not devnet", async () => {
    const { fetch, calls } = fakeFetch({ genesis: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" });
    const response = await createRpcProxy({ upstreamUrl: UPSTREAM, fetch })(
      rpcRequest(call("sendTransaction")),
    );
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).toContain("RPC is not devnet");
    expect(calls.some((c) => c.body.includes("sendTransaction"))).toBe(false);
  });

  it("answers 502 when the upstream fails or times out", async () => {
    const { fetch } = fakeFetch({ fail: true });
    const response = await createRpcProxy({ upstreamUrl: UPSTREAM, fetch })(
      rpcRequest(call("getTransaction")),
    );
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain("rpc.example");
    expect(text).not.toContain("secret-value");
  });

  it("checks the genesis again after an answer that is not devnet", async () => {
    const { fetch } = fakeFetch({ genesis: ["not-devnet", DEVNET_GENESIS_HASH] });
    const proxy = createRpcProxy({ upstreamUrl: UPSTREAM, fetch });
    expect((await proxy(rpcRequest(call("getTransaction")))).status).toBe(502);
    expect((await proxy(rpcRequest(call("getTransaction")))).status).toBe(200);
  });

  it("checks the genesis only once", async () => {
    const { fetch, calls } = fakeFetch();
    const proxy = createRpcProxy({ upstreamUrl: UPSTREAM, fetch });
    await proxy(rpcRequest(call("getTransaction")));
    await proxy(rpcRequest(call("getTransaction")));
    expect(calls.filter((c) => c.body.includes("getGenesisHash"))).toHaveLength(1);
  });

  it("limits each client", async () => {
    const { fetch, calls } = fakeFetch();
    const proxy = createRpcProxy({
      upstreamUrl: UPSTREAM,
      fetch,
      perClient: { max: 1, windowMs: 60_000 },
    });
    expect((await proxy(rpcRequest(call("getTransaction"), "1.1.1.1"))).status).toBe(200);
    const limited = await proxy(rpcRequest(call("getTransaction"), "1.1.1.1"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(await limited.json()).toMatchObject({ error: { code: -32005 } });
    expect((await proxy(rpcRequest(call("getTransaction"), "2.2.2.2"))).status).toBe(200);
    expect(calls.filter((c) => c.body.includes("getTransaction"))).toHaveLength(2);
  });

  it("puts every request without a client IP in one shared bucket", async () => {
    const { fetch } = fakeFetch();
    const proxy = createRpcProxy({
      upstreamUrl: UPSTREAM,
      fetch,
      perClient: { max: 1, windowMs: 60_000 },
    });
    expect((await proxy(rpcRequest(call("getTransaction")))).status).toBe(200);
    expect((await proxy(rpcRequest(call("getTransaction")))).status).toBe(429);
  });

  it("limits the total across clients", async () => {
    const { fetch } = fakeFetch();
    const proxy = createRpcProxy({
      upstreamUrl: UPSTREAM,
      fetch,
      total: { max: 1, windowMs: 60_000 },
    });
    expect((await proxy(rpcRequest(call("getTransaction"), "1.1.1.1"))).status).toBe(200);
    expect((await proxy(rpcRequest(call("getTransaction"), "2.2.2.2"))).status).toBe(429);
  });

  it("does not let a blocked client use up the total", async () => {
    const { fetch } = fakeFetch();
    const proxy = createRpcProxy({
      upstreamUrl: UPSTREAM,
      fetch,
      perClient: { max: 1, windowMs: 60_000 },
      total: { max: 3, windowMs: 60_000 },
    });
    for (let i = 0; i < 5; i++) await proxy(rpcRequest(call("getTransaction"), "6.6.6.6"));
    expect((await proxy(rpcRequest(call("getTransaction"), "1.1.1.1"))).status).toBe(200);
  });
});
