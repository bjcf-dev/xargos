import { fixtureSetupReady } from "@xargos/shared";
import { useEffect, useRef, useState } from "react";
import { api as defaultApi } from "@/lib/api";
import type { ApiClient } from "@/lib/api/client";
import { ApiClientError } from "@/lib/api/errors";
import { apiMode } from "@/lib/api/mode";
import { createMockSigner } from "./mock-signer";
import { type RunnerDeps, runPay, runSetup, runShock, runSign } from "./runner";
import type { DemoSigner } from "./signer";
import type { DemoStatus } from "./types";
import { useDemoMachine } from "./use-demo-machine";

/** TODO(F6): keypair generado en el navegador (D13); hasta entonces, el agente de las fixtures. */
export const DEMO_AGENT = fixtureSetupReady.agent;

/** Fuera de mock no hay firma hasta F6: falla con un error claro en vez de romper la página. */
const noSigner: DemoSigner = () =>
  Promise.reject(new ApiClientError("INTERNAL", "Signing arrives with F6"));

/** Solo se reintenta el setup o el pago: tras un fallo posterior, volver a pagar cobraría dos veces (x402). */
const RETRYABLE: ReadonlySet<DemoStatus> = new Set(["setup", "paying"]);

type UseDemoOptions = {
  recipeId: string;
  api?: ApiClient;
  /** undefined: el de mock en modo mock y ninguno fuera de él. null: sin signer. */
  signer?: DemoSigner | null;
  pollIntervalMs?: number;
};

/**
 * La demo para las pantallas: la máquina de F3 más las acciones que la mueven.
 * Solo hay una acción viva: empezar otra, reset() o desmontar aborta la anterior.
 */
export function useDemo({ recipeId, api = defaultApi, signer, pollIntervalMs }: UseDemoOptions) {
  const [state, dispatch] = useDemoMachine();
  const [modeSigner] = useState(() => (apiMode === "mock" ? createMockSigner() : null));
  const controller = useRef<AbortController | null>(null);

  const deps: RunnerDeps = {
    api,
    signer: (signer === undefined ? modeSigner : signer) ?? noSigner,
    recipeId,
    ...(pollIntervalMs ? { pollIntervalMs } : {}),
  };

  useEffect(() => () => controller.current?.abort(), []);

  function begin(): AbortSignal {
    controller.current?.abort();
    controller.current = new AbortController();
    return controller.current.signal;
  }

  function start() {
    void runSetup(deps, DEMO_AGENT, dispatch, begin());
  }

  function pay() {
    if (state.status === "setup" && state.setup.position) {
      void runPay(deps, state.agent, state.setup.position, dispatch, begin());
    } else if (state.status === "error" && state.agent && state.position) {
      void runPay(deps, state.agent, state.position, dispatch, begin());
    }
  }

  function shock() {
    if (state.status === "built") void runShock(deps, state.run.agent, dispatch, begin());
  }

  function sign() {
    if (state.status === "built") void runSign(deps, state.run, dispatch, begin());
  }

  const canRetry = state.status === "error" && RETRYABLE.has(state.failedAt);

  /** Vuelve a pagar si se conoce la posición; si no, repite el setup. */
  function retry() {
    if (state.status !== "error" || !canRetry) return;
    if (state.position) pay();
    else start();
  }

  function reset() {
    controller.current?.abort();
    controller.current = null;
    dispatch({ type: "RESET" });
  }

  return { state, start, pay, shock, sign, retry, canRetry, reset };
}
