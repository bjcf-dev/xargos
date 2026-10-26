import { ERROR_HTTP, type ErrorCode, type ErrorResponse } from "@xargos/shared";

/**
 * Proxy BFF: /api/xargos/* → BACKEND_URL (ver docs/api-contract.md, "Base").
 * Función pura con `fetch` inyectable; route.ts solo lee el entorno.
 */
export type ProxyConfig = {
  backendUrl: string | undefined;
  accessCode?: string | undefined;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/** Netlify corta las funciones a ~10 s y el backend responde en < 8 s (D25). */
export const UPSTREAM_TIMEOUT_MS = 9_000;

/** Primer segmento de las rutas del contrato; lo demás no sale hacia el backend. */
const ALLOWED_ROOTS = new Set(["recipes", "demo", "executions"]);

/**
 * Cabeceras por lista blanca. Las de x402 pasan intactas; ni cookies ni `authorization`
 * llegan al backend, y `content-encoding`/`content-length` no vuelven (fetch ya descomprimió).
 */
export const FORWARDED_REQUEST_HEADERS = ["accept", "content-type", "payment-signature"] as const;
export const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "payment-required",
  "payment-response",
] as const;

function pickHeaders(from: Headers, names: readonly string[]): Headers {
  const picked = new Headers();
  for (const name of names) {
    const value = from.get(name);
    if (value !== null) picked.set(name, value);
  }
  return picked;
}

function errorResponse(code: ErrorCode, message: string): Response {
  const body: ErrorResponse = { error: { code, message } };
  return Response.json(body, { status: ERROR_HTTP[code].status });
}

function upstreamUrl(backendUrl: string, path: string[], search: string): string {
  const base = backendUrl.replace(/\/+$/, "");
  return `${base}/${path.map(encodeURIComponent).join("/")}${search}`;
}

export function createXargosProxy(config: ProxyConfig) {
  const { backendUrl, fetch: doFetch = globalThis.fetch } = config;

  return async (request: Request, path: string[]): Promise<Response> => {
    if (!backendUrl) return errorResponse("INTERNAL", "Backend is not configured.");
    if (!ALLOWED_ROOTS.has(path[0] ?? "")) {
      return errorResponse("VALIDATION_ERROR", "Unknown API path.");
    }

    const method = request.method;
    const hasBody = method !== "GET" && method !== "HEAD";
    const upstream = await doFetch(upstreamUrl(backendUrl, path, new URL(request.url).search), {
      method,
      headers: pickHeaders(request.headers, FORWARDED_REQUEST_HEADERS),
      ...(hasBody ? { body: await request.arrayBuffer() } : {}),
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: pickHeaders(upstream.headers, FORWARDED_RESPONSE_HEADERS),
    });
  };
}
