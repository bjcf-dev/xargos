import { api } from "@/lib/api";
import type { FundScreenApi } from "./use-fund-assets";

/** Las llamadas de /fund que usa la pantalla, sobre el cliente único de lib/api. */
export const fundApi: FundScreenApi = {
  assets: (options) => api.fundAssets(options),
  quote: (request, options) => api.fundQuote(request, options),
  status: (depositAddress, memo, options) => api.fundStatus(depositAddress, memo, options),
};
