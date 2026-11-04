import { FUND_FINAL_STATUSES, type FundQuote } from "./contract";
import type { Deposit, FundError, FundEvent, FundState } from "./types";

/** Aurora ya no cambiará nada: SUCCESS, REFUNDED o FAILED. */
export function isSettled(state: FundState): boolean {
  return (
    state.status === "tracking" &&
    state.aurora !== undefined &&
    FUND_FINAL_STATUSES.includes(state.aurora)
  );
}

/** El depósito que se sigue, sacado de una cotización real. undefined si no trae dirección. */
function depositOf(quote: FundQuote): Deposit | undefined {
  if (!quote.depositAddress) return undefined;
  return {
    depositAddress: quote.depositAddress,
    ...(quote.depositMemo ? { depositMemo: quote.depositMemo } : {}),
    ...(quote.deadline ? { deadline: quote.deadline } : {}),
    ...(quote.timeWhenInactive ? { timeWhenInactive: quote.timeWhenInactive } : {}),
    quote,
  };
}

const NO_ADDRESS: FundError = {
  code: "FUND_UNAVAILABLE",
  message: "The quote came back without a deposit address",
};

/**
 * Reducer puro de /fund. Un evento que no aplica al estado actual devuelve el MISMO objeto.
 * Mientras se sigue un depósito nunca se pierde su dirección: los fallos de consulta se
 * guardan en `lastError` y se reintenta; solo `expired` o un estado final de Aurora lo cierran.
 */
export function fundReducer(state: FundState, event: FundEvent): FundState {
  switch (event.type) {
    case "PREVIEW_REQUESTED":
      if (state.status !== "idle" && state.status !== "previewed" && state.status !== "error") {
        return state;
      }
      return { status: "previewing", request: event.request };

    case "PREVIEW_RECEIVED":
      if (state.status !== "previewing") return state;
      return { status: "previewed", request: state.request, preview: event.preview };

    case "DEPOSIT_REQUESTED":
      if (state.status !== "previewed" && state.status !== "idle" && state.status !== "error") {
        return state;
      }
      return {
        status: "requesting",
        request: event.request,
        ...(state.status === "previewed" ? { preview: state.preview } : {}),
      };

    case "DEPOSIT_RECEIVED": {
      if (state.status !== "requesting") return state;
      const deposit = depositOf(event.quote);
      if (!deposit) return { status: "error", error: NO_ADDRESS, request: state.request };
      return { status: "tracking", deposit };
    }

    case "QUOTE_FAILED":
      if (state.status !== "previewing" && state.status !== "requesting") return state;
      return { status: "error", error: event.error, request: state.request };

    case "STATUS_RECEIVED": {
      if (state.status !== "tracking" || isSettled(state)) return state;
      if (event.status.depositAddress !== state.deposit.depositAddress) return state;
      if (state.lastCheck && event.status.status === "PENDING_DEPOSIT") {
        return { status: "expired", deposit: state.deposit, latest: event.status };
      }
      return {
        status: "tracking",
        deposit: state.deposit,
        aurora: event.status.status,
        latest: event.status,
      };
    }

    case "STATUS_FAILED":
      if (state.status !== "tracking" || isSettled(state)) return state;
      return { ...state, lastError: event.error };

    case "DEADLINE_PASSED":
      // Solo cuenta si no ha llegado nada: con un depósito de camino, Aurora sigue con él.
      if (state.status !== "tracking" || state.lastCheck) return state;
      if (state.aurora !== undefined && state.aurora !== "PENDING_DEPOSIT") return state;
      return { ...state, lastCheck: true };

    case "RESTORED":
      if (state.status !== "idle") return state;
      return { status: "tracking", deposit: event.deposit };

    case "RESET":
      // Con dinero de camino no se empieza de nuevo: se perdería la dirección.
      if (state.status === "tracking" && !isSettled(state)) return state;
      if (state.status === "idle") return state;
      return { status: "idle" };
  }
}
