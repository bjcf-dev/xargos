import type { FundQuoteRequest } from "@xargos/shared";
import { useEffect, useReducer, useRef, useState } from "react";
import { fundReducer, isSettled } from "./reducer";
import { type FundApi, type FundRunnerDeps, runDeposit, runPreview, trackDeposit } from "./runner";
import { createDepositStore, type DepositStore } from "./storage";
import { type FundState, initialFundState } from "./types";

export type UseFundOptions = {
  /** Las llamadas a /fund (lib/api, F13). */
  api: FundApi;
  /** Por defecto localStorage. */
  store?: DepositStore;
  intervalMs?: number;
  now?: () => number;
};

/** La dirección que hay que seguir ahora, o null si no hay nada de camino. */
function trackingAddress(state: FundState): string | null {
  return state.status === "tracking" && !isSettled(state) ? state.deposit.depositAddress : null;
}

/**
 * /fund para las pantallas (F15): la máquina de F14 más las acciones que la mueven.
 * Al montar recupera el depósito guardado; mientras haya uno sin cerrar lo sigue, y desmontar
 * aborta el seguimiento. Un precio nuevo cancela el anterior, y pedir la dirección cancela el precio
 * pendiente; un precio nunca cancela la petición de la dirección.
 */
export function useFund({ api, store: given, intervalMs, now }: UseFundOptions) {
  const [store] = useState(() => given ?? createDepositStore());
  const [state, dispatch] = useReducer(fundReducer, initialFundState);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Dos canales: un precio que sale tarde no puede abortar la petición de la dirección.
  const pricing = useRef<AbortController | null>(null);
  const requesting = useRef<AbortController | null>(null);

  const deps: FundRunnerDeps = {
    api,
    ...(intervalMs !== undefined ? { intervalMs } : {}),
    ...(now ? { now } : {}),
  };
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // Recargar: si había un depósito de camino, se sigue.
  useEffect(() => {
    const saved = store.load();
    if (saved) dispatch({ type: "RESTORED", deposit: saved });
  }, [store]);

  // Guardar mientras hay un depósito; olvidarlo al empezar de nuevo.
  const deposit = state.status === "tracking" ? state.deposit : undefined;
  const idle = state.status === "idle";
  useEffect(() => {
    if (deposit) store.save(deposit);
    else if (idle) store.clear();
  }, [store, deposit, idle]);

  const address = trackingAddress(state);
  useEffect(() => {
    if (!address) return;
    const controller = new AbortController();
    void trackDeposit(depsRef.current, dispatch, stateRef.current, controller.signal);
    return () => controller.abort();
  }, [address]);

  useEffect(
    () => () => {
      pricing.current?.abort();
      requesting.current?.abort();
    },
    [],
  );

  function begin(channel: typeof pricing): AbortSignal {
    channel.current?.abort();
    channel.current = new AbortController();
    return channel.current.signal;
  }

  return {
    state,
    /** Aurora ya no cambiará nada (SUCCESS, REFUNDED o FAILED). */
    settled: isSettled(state),
    preview: (request: FundQuoteRequest) =>
      void runPreview(deps, dispatch, request, begin(pricing)),
    requestDeposit: (request: FundQuoteRequest) => {
      // Cada cotización real crea una dirección en Aurora: con un depósito en curso, ninguna más.
      if (trackingAddress(stateRef.current)) return;
      pricing.current?.abort();
      void runDeposit(deps, dispatch, request, begin(requesting));
    },
    reset: () => dispatch({ type: "RESET" }),
  };
}
