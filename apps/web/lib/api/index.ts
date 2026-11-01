import { createApiClient, DEFAULT_BASE_URL } from "./client";

export type { ApiClient } from "./client";
export { createApiClient } from "./client";
export { ApiClientError } from "./errors";
export { type ApiMode, apiMode } from "./mode";
export { pollUntil } from "./poll";

// URL absoluta en el navegador: el fetch de Node (tests con jsdom) no acepta rutas relativas.
const baseUrl =
  typeof window === "undefined"
    ? DEFAULT_BASE_URL
    : new URL(DEFAULT_BASE_URL, window.location.origin).toString();

/** Cliente que usa la app. Ningún componente llama a fetch directamente. */
export const api = createApiClient({ baseUrl });
