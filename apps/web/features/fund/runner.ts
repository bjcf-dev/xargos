import type { FundQuote, FundQuoteRequest, FundStatusResponse } from "@xargos/shared";
import type { Dispatch } from "react";
import { ApiClientError } from "@/lib/api/errors";
import { sleep as wait } from "@/lib/api/poll";
import { fundReducer, isSettled } from "./reducer";
import type { Deposit, FundError, FundEvent, FundState } from "./types";

/** Lo que /fund necesita de lib/api (F13). Inyectable: los tests no tocan la red. */
export type FundApi = {
  quote(request: FundQuoteRequest, options?: { signal?: AbortSignal }): Promise<FundQuote>;
  status(
    depositAddress: string,
    depositMemo?: string,
    options?: { signal?: AbortSignal },
  ): Promise<FundStatusResponse>;
};

export type FundRunnerDeps = {
  api: FundApi;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Aurora recomienda consultar cada 5–10 s y no tiene webhooks. */
  intervalMs?: number;
};

export const FUND_POLL_INTERVAL_MS = 5_000;

/**
 * Hasta cuándo se puede enviar: `deadline` (Aurora, 4 nov), o `timeWhenInactive` si falta.
 * undefined sin ninguno de los dos: la dirección no caduca sola y se sigue consultando.
 */
export function sendBy(deposit: Deposit): number | undefined {
  if (deposit.deadline) return Date.parse(deposit.deadline);
  console.warn(
    deposit.timeWhenInactive
      ? "fund: the quote has no deadline, timeWhenInactive is used instead"
      : "fund: the quote has neither deadline nor timeWhenInactive, the address never expires here",
  );
  return deposit.timeWhenInactive ? Date.parse(deposit.timeWhenInactive) : undefined;
}

function toFundError(error: unknown): FundError {
  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
      ...(error.unreachable ? { unreachable: true as const } : {}),
    };
  }
  return { code: "INTERNAL", message: error instanceof Error ? error.message : "Unexpected error" };
}

/**
 * Sigue un depósito hasta que Aurora lo cierra o caduca. Lleva su propia copia del estado
 * (aplica el reducer a cada evento que despacha), así decide sin esperar a que React pinte.
 * Antes de cada consulta mira el plazo: si venció, esa consulta es la última. Un fallo se
 * despacha y se reintenta; abortar para en seco y no despacha nada más. Devuelve el estado final.
 */
export async function trackDeposit(
  { api, now = Date.now, sleep = wait, intervalMs = FUND_POLL_INTERVAL_MS }: FundRunnerDeps,
  dispatch: Dispatch<FundEvent>,
  initial: FundState,
  signal: AbortSignal,
): Promise<FundState> {
  let state = initial;
  const emit = (event: FundEvent) => {
    if (signal.aborted) return;
    dispatch(event);
    state = fundReducer(state, event);
  };
  const done = () => signal.aborted || state.status !== "tracking" || isSettled(state);

  if (state.status !== "tracking") return state;
  const limit = sendBy(state.deposit);

  while (!done()) {
    if (state.status !== "tracking") break;
    if (limit !== undefined && now() >= limit) emit({ type: "DEADLINE_PASSED" });
    const { depositAddress, depositMemo } = state.deposit;
    try {
      emit({
        type: "STATUS_RECEIVED",
        status: await api.status(depositAddress, depositMemo, { signal }),
      });
    } catch (error) {
      emit({ type: "STATUS_FAILED", error: toFundError(error) });
    }
    if (done()) break;
    try {
      await sleep(intervalMs, signal);
    } catch {
      break;
    }
  }
  return state;
}

async function quoteStep(
  api: FundApi,
  dispatch: Dispatch<FundEvent>,
  request: FundQuoteRequest,
  signal: AbortSignal,
  received: (quote: FundQuote) => FundEvent,
): Promise<void> {
  try {
    const quote = await api.quote(request, { signal });
    if (!signal.aborted) dispatch(received(quote));
  } catch (error) {
    if (!signal.aborted) dispatch({ type: "QUOTE_FAILED", error: toFundError(error) });
  }
}

/** Cotización `dry`: solo el precio, sin dirección ni movimiento de fondos. */
export async function runPreview(
  { api }: FundRunnerDeps,
  dispatch: Dispatch<FundEvent>,
  request: FundQuoteRequest,
  signal: AbortSignal,
): Promise<void> {
  const dry = { ...request, dry: true };
  dispatch({ type: "PREVIEW_REQUESTED", request: dry });
  await quoteStep(api, dispatch, dry, signal, (preview) => ({ type: "PREVIEW_RECEIVED", preview }));
}

/** Cotización real: Aurora da la dirección de depósito y sus plazos. */
export async function runDeposit(
  { api }: FundRunnerDeps,
  dispatch: Dispatch<FundEvent>,
  request: FundQuoteRequest,
  signal: AbortSignal,
): Promise<void> {
  const real = { ...request, dry: false };
  dispatch({ type: "DEPOSIT_REQUESTED", request: real });
  await quoteStep(api, dispatch, real, signal, (quote) => ({ type: "DEPOSIT_RECEIVED", quote }));
}
