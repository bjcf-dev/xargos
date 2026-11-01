import { type NextRequest, NextResponse } from "next/server";
import { buildCsp } from "@/lib/server/csp";

/**
 * Un nonce nuevo por petición en la CSP. Next lo lee de la cabecera de la petición y lo pone
 * en sus scripts; por eso las páginas se renderizan en dinámico (doc de Next, "Nonces").
 */
export function proxy(request: NextRequest) {
  // btoa y no Buffer: en Netlify el proxy corre como edge function (Deno).
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV === "development" });

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Ni la API (JSON) ni los estáticos ni los prefetch de next/link necesitan la CSP.
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
