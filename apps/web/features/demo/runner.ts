import type { Dispatch } from "react";
import type { ApiClient } from "@/lib/api/client";
import { ApiClientError } from "@/lib/api/errors";
import { pollUntil } from "@/lib/api/poll";
import type { DemoSigner } from "./signer";
import type { DemoError, DemoEvent, Run } from "./types";

export type RunnerDeps = {
  api: ApiClient;
  signer: DemoSigner;
  recipeId: string;
  /** Contrato: polling cada ~1,5 s. */
  pollIntervalMs?: number;
};

function toDemoError(error: unknown): DemoError {
  if (error instanceof ApiClientError) return { code: error.code, message: error.message };
  return { code: "INTERNAL", message: error instanceof Error ? error.message : "Unexpected error" };
}

/** Despacha solo mientras la acción sigue viva: lo que resuelva tras un abort no toca el estado. */
function unlessAborted(dispatch: Dispatch<DemoEvent>, signal: AbortSignal): Dispatch<DemoEvent> {
  return (event) => {
    if (!signal.aborted) dispatch(event);
  };
}

/** Ejecuta un paso: un error de API pasa a FAILED; si se abortó, no se despacha nada. */
async function step(
  dispatch: Dispatch<DemoEvent>,
  signal: AbortSignal,
  work: () => Promise<void>,
): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (signal.aborted) return;
    dispatch({ type: "FAILED", error: toDemoError(error) });
  }
}

export function runSetup(
  { api, pollIntervalMs = 1_500 }: RunnerDeps,
  agent: string,
  rawDispatch: Dispatch<DemoEvent>,
  signal: AbortSignal,
): Promise<void> {
  const dispatch = unlessAborted(rawDispatch, signal);
  dispatch({ type: "SETUP_STARTED", agent });
  return step(dispatch, signal, async () => {
    // Primero se pregunta: un agente que sobrevivió a la recarga no gasta otro setup ni el
    // límite por IP. Desconocido (servidor reiniciado, job caducado) o fallido: POST con el
    // mismo agente; el backend se salta lo que ya está hecho (#52).
    const known = await api.getSetupStatus(agent, { signal }).catch((error: unknown) => {
      if (
        error instanceof ApiClientError &&
        error.code === "VALIDATION_ERROR" &&
        error.status === 400
      )
        return null;
      throw error;
    });
    if (!known || known.phase === "failed") await api.startSetup({ agent }, { signal });
    await pollUntil(
      async () => {
        const setup = await api.getSetupStatus(agent, { signal });
        dispatch({ type: "SETUP_PROGRESS", setup });
        return setup;
      },
      (setup) => setup.phase === "ready" || setup.phase === "failed",
      { intervalMs: pollIntervalMs, signal },
    );
  });
}

export function runPay(
  { api, recipeId }: RunnerDeps,
  agent: string,
  position: string,
  rawDispatch: Dispatch<DemoEvent>,
  signal: AbortSignal,
): Promise<void> {
  const dispatch = unlessAborted(rawDispatch, signal);
  dispatch({ type: "PAY" });
  return step(dispatch, signal, async () => {
    const { data, paymentResponse } = await api.build(recipeId, { agent, position }, { signal });
    dispatch({ type: "BUILT", build: data, ...(paymentResponse ? { paymentResponse } : {}) });
  });
}

export function runShock(
  { api, pollIntervalMs = 1_500 }: RunnerDeps,
  agent: string,
  rawDispatch: Dispatch<DemoEvent>,
  signal: AbortSignal,
): Promise<void> {
  const dispatch = unlessAborted(rawDispatch, signal);
  dispatch({ type: "SHOCK_REQUESTED" });
  return step(dispatch, signal, async () => {
    const { shockId } = await api.startPriceShock({ agent }, { signal });
    dispatch({ type: "SHOCK_ACCEPTED", shockId });
    await pollUntil(
      async () => {
        const shock = await api.getPriceShockStatus(shockId, { signal });
        dispatch({ type: "SHOCK_SETTLED", shock });
        return shock;
      },
      (shock) => shock.status !== "pending",
      { intervalMs: pollIntervalMs, signal },
    );
  });
}

export function runSign(
  { signer }: RunnerDeps,
  run: Run,
  rawDispatch: Dispatch<DemoEvent>,
  signal: AbortSignal,
): Promise<void> {
  const dispatch = unlessAborted(rawDispatch, signal);
  dispatch({ type: "SIGN" });
  return step(dispatch, signal, async () => {
    const result = await signer(run, signal);
    dispatch(
      result.outcome === "confirmed"
        ? { type: "CONFIRMED", signature: result.signature }
        : { type: "REVERTED", signature: result.signature, failure: result.failure },
    );
  });
}
