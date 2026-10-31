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

/** Cabecera con la que el backend recibe el código en el price shock (B12). */
export const ACCESS_CODE_HEADER = "x-xargos-access-code";
/** Cabecera con la IP del navegador para el límite del backend; solo la pone el proxy. */
export const CLIENT_IP_HEADER = "x-xargos-client-ip";
/** Netlify pone aquí la IP de la conexión. */
const NETLIFY_CLIENT_IP = "x-nf-client-connection-ip";

/** Primer segmento de las rutas del contrato; lo demás no sale hacia el backend. */
const ALLOWED_ROOTS = new Set(["recipes", "demo", "executions"]);

/**
 * Cabeceras por lista blanca. Las de x402 pasan intactas; ni cookies ni `authorization`
 * llegan al backend, y `content-encoding`/`content-length` no vuelven (fetch ya descomprimió).
 */
export const FORWARDED_REQUEST_HEADERS = ["accept", "content-type", "payment-signature"] as const;
export const FORWARDED_RESPONSE_HEADERS = [
  "cache-control",
  "content-type",
  "payment-required",
  "payment-response",
  "retry-after",
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
  // El contrato pide no-store en toda respuesta de error.
  return Response.json(body, {
    status: ERROR_HTTP[code].status,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * El backend no contestó: un 502/504 sin cuerpo del contrato. Con un error del contrato el cliente
 * creería que el backend rechazó la petición y que x402 no cobró (D17), y tras un build que se
 * pasó de tiempo ofrecería "Try again", que podría cobrar otra vez.
 */
function gatewayResponse(status: 502 | 504): Response {
  return new Response(null, { status, headers: { "cache-control": "no-store" } });
}

/** Las cabeceras que salen hacia el backend: las de la lista y las que pone solo el proxy. */
function upstreamHeaders(
  request: Request,
  path: string[],
  accessCode: string | undefined,
): Headers {
  const headers = pickHeaders(request.headers, FORWARDED_REQUEST_HEADERS);
  const ip = request.headers.get(NETLIFY_CLIENT_IP);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  const isShock = request.method === "POST" && path.join("/") === "demo/price-shock";
  if (isShock && accessCode) headers.set(ACCESS_CODE_HEADER, accessCode);
  return headers;
}

function upstreamUrl(backendUrl: string, path: string[], search: string): string {
  const base = backendUrl.replace(/\/+$/, "");
  return `${base}/${path.map(encodeURIComponent).join("/")}${search}`;
}

/** Solo POST /demo/setup con cuerpo JSON de objeto; si no, el cuerpo sale tal cual. */
async function requestBody(
  request: Request,
  path: string[],
  accessCode: string | undefined,
): Promise<ArrayBuffer | string> {
  const raw = await request.arrayBuffer();
  const isSetup = request.method === "POST" && path.length === 2 && path.join("/") === "demo/setup";
  if (!isSetup || !accessCode) return raw;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(raw));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return raw;
    return JSON.stringify({ ...parsed, accessCode });
  } catch {
    return raw;
  }
}

export function createXargosProxy(config: ProxyConfig) {
  const {
    backendUrl,
    accessCode,
    fetch: doFetch = globalThis.fetch,
    timeoutMs = UPSTREAM_TIMEOUT_MS,
  } = config;

  return async (request: Request, path: string[]): Promise<Response> => {
    if (!backendUrl) return errorResponse("INTERNAL", "Backend is not configured.");
    // Next ya normaliza `..`; esto protege a quien llame al proxy por otro camino.
    const unsafeSegment = path.some((s) => s === "" || s === "." || s === "..");
    if (unsafeSegment || !ALLOWED_ROOTS.has(path[0] ?? "")) {
      return errorResponse("VALIDATION_ERROR", "Unknown API path.");
    }

    const method = request.method;
    const hasBody = method !== "GET" && method !== "HEAD";
    let upstream: Response;
    try {
      upstream = await doFetch(upstreamUrl(backendUrl, path, new URL(request.url).search), {
        method,
        headers: upstreamHeaders(request, path, accessCode),
        signal: AbortSignal.timeout(timeoutMs),
        ...(hasBody ? { body: await requestBody(request, path, accessCode) } : {}),
      });
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === "TimeoutError";
      return gatewayResponse(timedOut ? 504 : 502);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: pickHeaders(upstream.headers, FORWARDED_RESPONSE_HEADERS),
    });
  };
}
