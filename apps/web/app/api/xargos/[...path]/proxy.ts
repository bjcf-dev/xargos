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
      ...(hasBody ? { body: await request.arrayBuffer() } : {}),
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: upstream.headers,
    });
  };
}
