// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRpcProxy, DEVNET_GENESIS_HASH } from "./rpc-proxy";

const UPSTREAM = "https://rpc.example/?api-key=secret-value";

type Call = { url: string; body: string };

function fakeFetch({
  genesis = DEVNET_GENESIS_HASH,
  answer = { result: "ok" },
  fail = false,
} = {}) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const body = String(init.body);
    calls.push({ url, body });
    if (body.includes("getGenesisHash")) {
      return Response.json({ jsonrpc: "2.0", id: 0, result: genesis });
    }
    if (fail) throw new Error(`connect ECONNREFUSED ${url}`);
    return Response.json({ jsonrpc: "2.0", id: 1, ...answer });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const rpcRequest = (body: unknown) =>
  new Request("http://localhost/api/xargos/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
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

  it("rejects a method outside the list", async () => {
    const { fetch, calls } = fakeFetch();
    const response = await createRpcProxy({ upstreamUrl: UPSTREAM, fetch })(
      rpcRequest(call("requestAirdrop")),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ jsonrpc: "2.0", id: 1, error: { code: -32601 } });
    expect(calls).toHaveLength(0);
  });

  it("rejects a batch", async () => {
    const { fetch } = fakeFetch();
    const response = await createRpcProxy({ upstreamUrl: UPSTREAM, fetch })(
      rpcRequest([call("getTransaction")]),
    );
    expect(response.status).toBe(400);
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

  it("checks the genesis only once", async () => {
    const { fetch, calls } = fakeFetch();
    const proxy = createRpcProxy({ upstreamUrl: UPSTREAM, fetch });
    await proxy(rpcRequest(call("getTransaction")));
    await proxy(rpcRequest(call("getTransaction")));
    expect(calls.filter((c) => c.body.includes("getGenesisHash"))).toHaveLength(1);
  });
});
