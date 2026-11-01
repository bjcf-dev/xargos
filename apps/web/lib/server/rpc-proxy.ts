import { createRateLimiter } from "./rate-limit";

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

type Window = { max: number; windowMs: number };
type Deps = {
  upstreamUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Por cliente: una demo hace ~70 llamadas (polling de 1 s durante como mucho 60 s). */
  perClient?: Window;
  /** Total de la instancia: el techo si la IP del cliente no llega o se falsifica. */
  total?: Window;
};
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
export function createRpcProxy({
  upstreamUrl,
  fetch = globalThis.fetch,
  timeoutMs = 8_000,
  perClient = { max: 120, windowMs: 60_000 },
  total = { max: 600, windowMs: 60_000 },
}: Deps) {
  let devnet: Promise<boolean> | null = null;
  const limitClient = createRateLimiter(perClient);
  const limitTotal = createRateLimiter(total);

  const post = (body: string) =>
    fetch(upstreamUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });

  // Solo se guarda el "sí": un fallo de red o una respuesta rara se vuelve a comprobar.
  function isDevnet(): Promise<boolean> {
    devnet ??= post(JSON.stringify({ jsonrpc: "2.0", id: 0, method: "getGenesisHash" }))
      .then(async (response) => (await response.json()).result === DEVNET_GENESIS_HASH)
      .then((yes) => {
        if (!yes) devnet = null;
        return yes;
      })
      .catch((error: unknown) => {
        devnet = null;
        throw error;
      });
    return devnet;
  }

  return async function proxy(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      const response = rpcError(405, null, -32600, "Use POST");
      response.headers.set("allow", "POST");
      return response;
    }
    // Netlify pone la IP del cliente en x-nf-client-connection-ip (comprobarlo al desplegar, F7).
    const client = request.headers.get("x-nf-client-connection-ip") ?? "unknown";
    // Primero el del cliente: uno bloqueado no debe gastar el cupo total de los demás.
    const byClient = limitClient(client);
    const decision = byClient.allowed ? limitTotal("all") : byClient;
    if (!decision.allowed) {
      const response = rpcError(429, null, -32005, "Too many requests, try again later");
      response.headers.set("retry-after", String(decision.retryAfterSeconds));
      return response;
    }

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
    const {
      id = null,
      method,
      params,
    } = message as { id?: unknown; method?: unknown; params?: unknown };
    if (id !== null && typeof id !== "string" && typeof id !== "number") {
      return rpcError(400, null, -32600, "Invalid id");
    }
    if (typeof method !== "string" || !ALLOWED.has(method)) {
      return rpcError(403, id, -32601, "Method not allowed");
    }
    // Se reenvía lo comprobado, no el texto: con claves repetidas el RPC podría leer otro método.
    const checked = JSON.stringify({ jsonrpc: "2.0", id, method, params });

    try {
      if (!(await isDevnet())) return rpcError(502, id, -32603, "RPC is not devnet");
      const upstream = await post(checked);
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
