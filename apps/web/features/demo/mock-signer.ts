import { fixtureGuardFailLogs, parseGuardFail } from "@xargos/shared";
import { sleep } from "@/lib/api/poll";
import type { DemoSigner } from "./signer";

/**
 * Signer de modo mock: no firma nada. Sin shock la tx "se confirma" (demo A); tras el
 * price shock "revierte" por el guard con los logs de la fixture (demo B, D10).
 */
export function createMockSigner({ latencyMs = 400 }: { latencyMs?: number } = {}): DemoSigner {
  return async (run, signal) => {
    await sleep(latencyMs, signal);
    const signature = `mock_${run.build.buildId}`;
    if (!run.shock) return { outcome: "confirmed", signature };
    return {
      outcome: "reverted",
      signature,
      failure: {
        instructionIndex: run.build.guard.assertIndex,
        guard: parseGuardFail(fixtureGuardFailLogs),
      },
    };
  };
}
