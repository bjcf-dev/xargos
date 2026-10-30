/**
 * CSP estricta (condición 4 de Billy, D30). Los scripts solo corren con el nonce de la petición:
 * ni un XSS ni un script inyectado pueden usar la clave del agente para firmar.
 * Estilos con 'unsafe-inline': React pinta atributos style="" en el SSR, que un nonce no cubre;
 * un estilo inyectado no ejecuta código.
 */
export function buildCsp({ nonce, dev }: { nonce: string; dev: boolean }): string {
  const directives = [
    "default-src 'self'",
    // 'unsafe-eval' solo en desarrollo: React lo usa para reconstruir las trazas del servidor.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // El navegador solo habla con /api/xargos/* (D30); en dev, también el websocket de HMR.
    "connect-src 'self'",
    // El service worker de MSW en modo mock.
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}
