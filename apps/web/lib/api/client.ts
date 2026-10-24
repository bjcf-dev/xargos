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

export function createApiClient({
  fetch = globalThis.fetch.bind(globalThis),
  baseUrl = DEFAULT_BASE_URL,
}: ApiClientOptions = {}) {
  async function request<S extends z.ZodType>(
    schema: S,
    path: string,
    body?: unknown,
  ): Promise<z.output<S>> {
    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}${path}`,
        body === undefined
          ? { method: "GET" }
          : {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            },
      );
    } catch (cause) {
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
    return parsed.data;
  }

  return {
    listRecipes: () => request(RecipeList, routes.recipes),
    build: (recipeId: string, body: BuildRequest) =>
      request(BuildResponse, routes.build(recipeId), body),
    startSetup: (body: DemoSetupRequest) => request(DemoSetupAccepted, routes.demoSetup, body),
    getSetupStatus: (agent: string) => request(DemoSetupStatus, routes.demoSetupStatus(agent)),
    startPriceShock: (body: PriceShockRequest) =>
      request(PriceShockAccepted, routes.priceShock, body),
    getPriceShockStatus: (shockId: string) =>
      request(PriceShockStatus, routes.priceShockStatus(shockId)),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
