import { HttpResponse, type UnhandledFrameHandle } from "msw";
import { HttpNetworkFrame } from "msw/experimental";
import { DEFAULT_BASE_URL } from "@/lib/api/client";

/** ¿Va a nuestra API? Mismo prefijo que usa el cliente (`DEFAULT_BASE_URL`). */
export function isApiRequest(url: string): boolean {
  const { pathname } = new URL(url, "http://localhost");
  return pathname === DEFAULT_BASE_URL || pathname.startsWith(`${DEFAULT_BASE_URL}/`);
}

/**
 * En modo mock, una llamada a /api/xargos/* sin handler no debe salir al proxy
 * real: se responde aquí con un 501 del contrato. El resto (assets de Next,
 * imágenes…) pasa sin tocar.
 *
 * `defaults.error()` solo imprime el aviso (MSW 3.0.3); lo que corta la
 * petición es lanzar: si se lanza un Response, MSW responde con él.
 * El 501 ("Not Implemented") es a propósito y no sale de ERROR_HTTP: es una
 * señal de los mocks (falta un handler), no un error que dé el backend.
 */
export const onUnhandledFrame: Exclude<UnhandledFrameHandle, string> = ({ frame, defaults }) => {
  if (!(frame instanceof HttpNetworkFrame)) return;
  const { request } = frame.data;
  if (!isApiRequest(request.url)) return;

  defaults.error();
  const { pathname } = new URL(request.url);
  throw HttpResponse.json(
    {
      error: {
        code: "INTERNAL",
        message: `No mock handler for ${request.method} ${pathname}`,
      },
    },
    { status: 501 },
  );
};
