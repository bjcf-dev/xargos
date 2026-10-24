"use client";

import { type PropsWithChildren, useEffect, useState } from "react";
import { apiMode } from "@/lib/api";

type WorkerState = "starting" | "ready" | "failed";

/**
 * En modo mock arranca MSW antes de pintar la app, para que ninguna petición a
 * /api/xargos/* se escape al proxy. En local/staging no carga MSW (import dinámico).
 */
export function MswProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<WorkerState>(apiMode === "mock" ? "starting" : "ready");

  useEffect(() => {
    if (apiMode !== "mock") return;
    let active = true;
    import("@/mocks/browser")
      .then(({ startMockWorker }) => startMockWorker())
      .then(
        () => active && setState("ready"),
        (error: unknown) => {
          console.error("MSW failed to start", error);
          if (active) setState("failed");
        },
      );
    return () => {
      active = false;
    };
  }, []);

  if (state === "starting") return null;
  if (state === "failed") {
    return (
      <p className="mx-auto max-w-4xl px-6 py-10 text-sm text-destructive">
        Mock mode could not start (MSW). Reload the page or check the console.
      </p>
    );
  }
  return children;
}
