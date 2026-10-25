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
  dispatch: Dispatch<DemoEvent>,
  signal: AbortSignal,
): Promise<void> {
  dispatch({ type: "SETUP_STARTED", agent });
  return step(dispatch, signal, async () => {
    await api.startSetup({ agent }, { signal });
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
  dispatch: Dispatch<DemoEvent>,
  signal: AbortSignal,
): Promise<void> {
  dispatch({ type: "PAY" });
  return step(dispatch, signal, async () => {
    const { data, paymentResponse } = await api.build(recipeId, { agent, position }, { signal });
    dispatch({ type: "BUILT", build: data, ...(paymentResponse ? { paymentResponse } : {}) });
  });
}

export function runShock(
  { api, pollIntervalMs = 1_500 }: RunnerDeps,
  agent: string,
  dispatch: Dispatch<DemoEvent>,
  signal: AbortSignal,
): Promise<void> {
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
  dispatch: Dispatch<DemoEvent>,
  signal: AbortSignal,
): Promise<void> {
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
