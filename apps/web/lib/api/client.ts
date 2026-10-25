import {
  type BuildRequest,
  BuildResponse,
  DemoSetupAccepted,
  type DemoSetupRequest,
  DemoSetupStatus,
  ErrorResponse,
  PriceShockAccepted,
  type PriceShockRequest,
  PriceShockStatus,
  RecipeList,
  routes,
} from "@xargos/shared";
import type { z } from "zod";
import { ApiClientError } from "./errors";

/** El navegador solo habla con el proxy de Next (F5). */
export const DEFAULT_BASE_URL = "/api/xargos";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ApiClientOptions = {
  /** Inyectable: en F8 será el fetch envuelto por @x402/fetch. */
  fetch?: FetchLike;
  baseUrl?: string;
};

export type CallOptions = {
  /** Para cancelar la petición en vuelo (p. ej. al desmontar la pantalla). */
  signal?: AbortSignal;
};

export type BuildResult = {
  data: BuildResponse;
  /** Cabecera PAYMENT-RESPONSE de x402, intacta: el recibo del pago con la firma (F8). */
  paymentResponse?: string;
};

export function createApiClient({
  // Se resuelve en cada llamada: así se usa el fetch vigente (p. ej. el que parchea MSW).
  fetch = (input, init) => globalThis.fetch(input, init),
  baseUrl = DEFAULT_BASE_URL,
}: ApiClientOptions = {}) {
  async function send<S extends z.ZodType>(
    schema: S,
    path: string,
    body: unknown,
    { signal }: CallOptions = {},
  ): Promise<{ data: z.output<S>; headers: Headers }> {
    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}${path}`,
        body === undefined
          ? { method: "GET", signal: signal ?? null }
          : {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
              signal: signal ?? null,
            },
      );
    } catch (cause) {
      // Cancelar no es un error de red: se propaga tal cual, como en pollUntil.
      if (signal?.aborted) throw cause;
      throw new ApiClientError("INTERNAL", "Network error", { cause });
    }

    const data: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
      const parsed = ErrorResponse.safeParse(data);
      const paymentRequired = response.headers.get("PAYMENT-REQUIRED") ?? undefined;
      if (parsed.success) {
        const { code, message, details } = parsed.data.error;
        throw new ApiClientError(code, message, {
          status: response.status,
          details,
          ...(paymentRequired ? { paymentRequired } : {}),
        });
      }
      if (response.status === 402) {
        throw new ApiClientError("PAYMENT_REQUIRED", "Payment required", {
          status: 402,
          ...(paymentRequired ? { paymentRequired } : {}),
        });
      }
      throw new ApiClientError("INTERNAL", `Unexpected HTTP ${response.status}`, {
        status: response.status,
      });
    }

    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new ApiClientError("INTERNAL", "Response does not match the contract", {
        status: response.status,
        details: parsed.error.issues,
      });
    }
    return { data: parsed.data, headers: response.headers };
  }

  async function request<S extends z.ZodType>(
    schema: S,
    path: string,
    body: unknown,
    options?: CallOptions,
  ): Promise<z.output<S>> {
    return (await send(schema, path, body, options)).data;
  }

  return {
    listRecipes: (options?: CallOptions) => request(RecipeList, routes.recipes, undefined, options),
    build: async (
      recipeId: string,
      body: BuildRequest,
      options?: CallOptions,
    ): Promise<BuildResult> => {
      const { data, headers } = await send(BuildResponse, routes.build(recipeId), body, options);
      const paymentResponse = headers.get("PAYMENT-RESPONSE");
      return paymentResponse ? { data, paymentResponse } : { data };
    },
    startSetup: (body: DemoSetupRequest, options?: CallOptions) =>
      request(DemoSetupAccepted, routes.demoSetup, body, options),
    getSetupStatus: (agent: string, options?: CallOptions) =>
      request(DemoSetupStatus, routes.demoSetupStatus(agent), undefined, options),
    startPriceShock: (body: PriceShockRequest, options?: CallOptions) =>
      request(PriceShockAccepted, routes.priceShock, body, options),
    getPriceShockStatus: (shockId: string, options?: CallOptions) =>
      request(PriceShockStatus, routes.priceShockStatus(shockId), undefined, options),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
