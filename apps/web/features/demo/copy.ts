import type { Guard, Recipe, Step } from "@xargos/shared";
import type { ApiMode } from "@/lib/api/mode";
import { formatUnits, SOL_DECIMALS, USDC_DECIMALS } from "@/lib/format";
import type { DemoState, RevertFailure, Run } from "./types";

/** ADR 0003: el pool usa un USDC propio. Solo la comisión x402 es USDC de Circle. */
export const POOL_TOKEN = "demo USDC";

/** Lo que la UI enseña de cada paso: un setup que va después del snapshot es limpieza. */
export type StepTag = "setup" | "action" | "guard" | "cleanup";

export function stepTag(step: Step, guard: Guard): StepTag {
  if (step.kind === "setup" && step.index > guard.snapshotIndex) return "cleanup";
  return step.kind;
}

/** Puntos básicos → porcentaje legible (50 → "0.5%"). */
export function slippageLabel(bps: number): string {
  return `${bps / 100}%`;
}

/** Segundos enteros que le quedan a la tx; nunca negativo. */
export function secondsLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
}

export type RevertCopy = { title: string; detail: string; byGuard: boolean };

/** D15: "guard" solo si la cadena dice que falló el guard; si no, el paso que falló. */
export function describeRevert(run: Run, failure: RevertFailure): RevertCopy {
  if (failure.guard) {
    const received = formatUnits(failure.guard.received, USDC_DECIMALS);
    const min = formatUnits(failure.guard.min, USDC_DECIMALS);
    return {
      title: "Reverted by the guard",
      detail: `The agent would have received ${received} ${POOL_TOKEN}, below the ${min} ${POOL_TOKEN} minimum.`,
      byGuard: true,
    };
  }
  const detail = "The whole transaction was rolled back, so no step took effect.";
  if (failure.instructionIndex === null) {
    return { title: "The transaction failed on-chain", detail, byGuard: false };
  }
  const step = run.build.steps.find((s) => s.index === failure.instructionIndex);
  const title = step
    ? `Step ${step.index} · ${step.label} (${step.protocol}) failed`
    : `Instruction ${failure.instructionIndex} failed`;
  return { title, detail, byGuard: false };
}

/** Comisión de la receta, cobrada con x402 en USDC de Circle. */
export function formatFee(price: Recipe["price"]): string {
  return `${formatUnits(price.amount, USDC_DECIMALS)} USDC`;
}

export type SpentCopy = { recipeFee: string; networkFee: string | null };

/** D16: lo que sí se gastó aunque la tx revierta. La comisión de red llega con getTransaction (F10). */
export function describeSpent(
  price: Recipe["price"],
  networkFeeLamports: bigint | null,
): SpentCopy {
  return {
    recipeFee: formatFee(price),
    networkFee:
      networkFeeLamports === null ? null : `${formatUnits(networkFeeLamports, SOL_DECIMALS)} SOL`,
  };
}

export type X402StepState = "done" | "active" | "pending" | "simulated";
export type X402Step = {
  key: "request" | "challenge" | "sign" | "receipt";
  label: string;
  state: X402StepState;
};

const X402_LABELS: Record<X402Step["key"], string> = {
  request: "Agent requests the build",
  challenge: "402 Payment Required",
  sign: "Agent signs the USDC payment",
  receipt: "200 OK + payment receipt",
};

/** Línea de tiempo del pago x402. En mock no hay 402: el resto sale como "simulated". */
export function x402Timeline(state: DemoState, mode: ApiMode): X402Step[] {
  const run = "run" in state ? state.run : null;
  const requested = state.status === "paying" || run !== null;

  let states: [X402StepState, X402StepState, X402StepState, X402StepState];
  if (!requested) {
    states = ["pending", "pending", "pending", "pending"];
  } else if (mode === "mock") {
    states = ["done", "simulated", "simulated", "simulated"];
  } else if (run === null) {
    states = ["done", "active", "pending", "pending"];
  } else {
    states = ["done", "done", "done", run.paymentResponse ? "done" : "pending"];
  }

  return (["request", "challenge", "sign", "receipt"] as const).map((key, i) => ({
    key,
    label: X402_LABELS[key],
    state: states[i] ?? "pending",
  }));
}
