import { createXargosProxy } from "./proxy";

type Context = { params: Promise<{ path: string[] }> };

/**
 * El entorno se lee en cada petición: BACKEND_URL, DEMO_ACCESS_CODE y PROXY_SHARED_SECRET solo
 * existen en el servidor.
 */
async function handle(request: Request, { params }: Context): Promise<Response> {
  const proxy = createXargosProxy({
    backendUrl: process.env.BACKEND_URL,
    accessCode: process.env.DEMO_ACCESS_CODE,
    proxySecret: process.env.PROXY_SHARED_SECRET,
  });
  return proxy(request, (await params).path);
}

export { handle as GET, handle as POST };
