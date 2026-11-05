"use client";

import type { FundAssetsResponse } from "@xargos/shared";
import { useEffect, useState } from "react";
import { type FundApi, toFundError } from "./runner";
import type { FundError } from "./types";

/** Lo que necesita la pantalla /fund: las llamadas de F14 más la lista de orígenes. */
export type FundScreenApi = FundApi & {
  assets(options?: { signal?: AbortSignal }): Promise<FundAssetsResponse>;
};

export type FundAssetsState =
  | { status: "loading" }
  | { status: "ready"; assets: FundAssetsResponse }
  | { status: "error"; error: FundError; retry: () => void };

/** Carga una vez los orígenes (redes y tokens) y el destino. Desmontar aborta la petición. */
export function useFundAssets(api: Pick<FundScreenApi, "assets">): FundAssetsState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<FundAssetsState>({ status: "loading" });

  // biome-ignore lint/correctness/useExhaustiveDependencies: se carga al montar y en cada reintento, no al cambiar la api.
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    api.assets({ signal: controller.signal }).then(
      (assets) => {
        if (!controller.signal.aborted) setState({ status: "ready", assets });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          error: toFundError(error),
          retry: () => setAttempt((n) => n + 1),
        });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  return state;
}
