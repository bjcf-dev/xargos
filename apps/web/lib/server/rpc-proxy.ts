/** Lo único que el navegador puede pedirle a Solana (F6, D30). */
export const RPC_METHODS = [
  "getLatestBlockhash",
  "simulateTransaction",
  "sendTransaction",
  "getSignatureStatuses",
  "getTransaction",
] as const;

export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const DEVNET_PUBLIC_RPC = "https://api.devnet.solana.com";

const MAX_BODY_BYTES = 64 * 1024;
const ALLOWED: ReadonlySet<string> = new Set(RPC_METHODS);

type Deps = { upstreamUrl: string; fetch?: typeof fetch; timeoutMs?: number };
type RequestId = string | number | null;

function rpcError(status: number, id: RequestId, code: number, message: string): Response {
  return Response.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

/**
 * Reenvía JSON-RPC a un RPC de devnet que solo conoce el servidor. Nunca devuelve su URL
 * (puede llevar una api-key) ni sus errores de red: solo mensajes propios.
 */
export function createRpcProxy({ upstreamUrl, fetch = globalThis.fetch, timeoutMs = 8_000 }: Deps) {
  let devnet: Promise<boolean> | null = null;

  const post = (body: string) =>
    fetch(upstreamUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });

  // Una vez por instancia; un fallo de red no se guarda, para volver a intentarlo.
  function isDevnet(): Promise<boolean> {
    devnet ??= post(JSON.stringify({ jsonrpc: "2.0", id: 0, method: "getGenesisHash" }))
      .then(async (response) => (await response.json()).result === DEVNET_GENESIS_HASH)
      .catch((error: unknown) => {
        devnet = null;
        throw error;
      });
    return devnet;
  }

  return async function proxy(request: Request): Promise<Response> {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return rpcError(413, null, -32600, "Request too large");
    }

    let message: unknown;
    try {
      message = JSON.parse(body);
    } catch {
      return rpcError(400, null, -32700, "Invalid JSON");
    }
    if (Array.isArray(message) || typeof message !== "object" || message === null) {
      return rpcError(400, null, -32600, "Send one JSON-RPC request, not a batch");
    }
    const { id = null, method } = message as { id?: RequestId; method?: unknown };
    if (typeof method !== "string" || !ALLOWED.has(method)) {
      return rpcError(403, id, -32601, "Method not allowed");
    }

    try {
      if (!(await isDevnet())) return rpcError(502, id, -32603, "RPC is not devnet");
      const upstream = await post(body);
      if (!upstream.ok) return rpcError(502, id, -32603, "RPC unavailable");
      return new Response(await upstream.text(), {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    } catch {
      return rpcError(502, id, -32603, "RPC unavailable");
    }
  };
}
