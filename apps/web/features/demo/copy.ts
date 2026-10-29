import type { ErrorCode, Guard, Recipe, Step } from "@xargos/shared";
import type { ApiMode } from "@/lib/api/mode";
import { formatUnits, SOL_DECIMALS, USDC_DECIMALS } from "@/lib/format";
import type { DemoError, DemoState, DemoStatus, RevertFailure, Run } from "./types";

/** ADR 0003: el pool usa un USDC propio. Solo la comisión x402 es USDC de Circle. */
export const POOL_TOKEN = "demo USDC";

/** Los dos caminos de la demo, elegidos desde el principio; la máquina de estados no cambia. */
export type DemoPath = "A" | "B";
/** `ariaLabel` sin el "·", que algunos lectores de pantalla leen como "dot". */
export const DEMO_PATHS: Record<DemoPath, { label: string; ariaLabel: string; line: string }> = {
  A: {
    label: "A · Happy path",
    ariaLabel: "Path A: happy path",
    line: "The agent pays, signs and receives at least the guaranteed minimum.",
  },
  B: {
    label: "B · Price moves against the agent",
    ariaLabel: "Path B: price moves against the agent",
    line: "The pool price drops before signing; the guard reverts the whole transaction if the agent would receive less than the minimum.",
  },
};

/**
 * Lo que la UI enseña de cada paso. Un setup solo es limpieza si va después del assert: entre
 * el snapshot y el assert van las cuentas de tokens que prepara la receta (tx real de la #51).
 */
export type StepTag = "setup" | "action" | "guard" | "cleanup";

export function stepTag(step: Step, guard: Guard): StepTag {
  if (step.kind === "setup" && step.index > guard.assertIndex) return "cleanup";
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

/** El shock en devnet tarda varios segundos (polling cada ~1,5 s); por debajo, la tx caduca antes de firmar. */
export const SHOCK_MIN_SECONDS = 20;

export function canShock(secondsLeft: number | null): boolean {
  return secondsLeft !== null && secondsLeft >= SHOCK_MIN_SECONDS;
}

/** Cifras del revert del guard, ya formateadas y sin unidad. */
export type RevertFigures = { received: string; minimum: string; shortfall: string };

const SHOCK_CHANGE = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

/** El shock con su par y su variación; sin porcentaje si algún precio no sirve para calcularlo. */
export function describeShock(priceBefore: string, priceAfter: string): string {
  const pair = `SOL/${POOL_TOKEN} ${priceBefore} → ${priceAfter}`;
  const before = Number(priceBefore);
  const after = Number(priceAfter);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 0) return pair;
  return `${pair} (${SHOCK_CHANGE.format((after - before) / before)})`;
}

/** Hacia dónde movió el shock el precio; null si algún precio no es un número o no cambió. */
export function shockTrend(priceBefore: string, priceAfter: string): "up" | "down" | null {
  const before = priceBefore.trim() === "" ? Number.NaN : Number(priceBefore);
  const after = priceAfter.trim() === "" ? Number.NaN : Number(priceAfter);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === after) return null;
  return after < before ? "down" : "up";
}

export type HumanError = { title: string; hint: string };

/** Frases para personas por código. Es un Record: un código nuevo sin texto no compila. */
const HUMAN_ERRORS: Record<ErrorCode, HumanError | null> = {
  PAYMENT_REQUIRED: {
    title: "The payment was not completed",
    hint: "The agent did not pay for the build.",
  },
  PAYMENT_INVALID: {
    title: "The payment was rejected",
    hint: "The x402 payment could not be verified.",
  },
  BUILD_FAILED: {
    title: "The transaction could not be built",
    hint: "The backend could not prepare the recipe. Try again in a moment.",
  },
  BUILD_EXPIRED: { title: "The transaction expired", hint: "Start over to build a new one." },
  REBUILD_WINDOW_CLOSED: {
    title: "The free rebuild window has closed",
    hint: "Start over to build and pay for a new transaction.",
  },
  RATE_LIMITED: { title: "Too many demos right now", hint: "Wait a moment, then try again." },
  ACCESS_DENIED: {
    title: "This demo is not open right now",
    hint: "The demo refused access. Ask the xARGOS team.",
  },
  VALIDATION_ERROR: {
    title: "The request was not valid",
    hint: "Start over. If it keeps happening, the demo may need an update.",
  },
  SETUP_FAILED: {
    title: "The agent could not be prepared",
    hint: "Setting up the demo agent on devnet failed. Try again in a moment.",
  },
  SHOCK_FAILED: {
    title: "The price shock failed",
    hint: "The price shock could not be applied.",
  },
  // Nuestros propios errores (p. ej. "No signer for this agent"): el mensaje ya es para personas.
  INTERNAL: null,
};

const UNREACHABLE: HumanError = {
  title: "The demo backend is not responding",
  hint: "It may be starting up or down. Try again in a minute.",
};

/** La espera de Retry-After en palabras: segundos hasta un minuto, minutos redondeados después. */
function waitHint(seconds: number): string {
  if (seconds < 60)
    return `Wait ${seconds} ${seconds === 1 ? "second" : "seconds"}, then try again.`;
  const minutes = Math.round(seconds / 60);
  return `Wait about ${minutes} ${minutes === 1 ? "minute" : "minutes"}, then try again.`;
}

export function humanError(error: DemoError): HumanError {
  if (error.unreachable) return UNREACHABLE;
  if (error.code === "RATE_LIMITED" && error.retryAfterSeconds) {
    return { title: "Too many demos right now", hint: waitHint(error.retryAfterSeconds) };
  }
  return (
    HUMAN_ERRORS[error.code] ?? {
      title: "Something went wrong",
      hint: error.message || "Try again in a moment, or start over.",
    }
  );
}

/** Página que explica cada pago fallido (criterio del jurado). */
export const FAILED_PAYMENTS_HREF = "/failed-payments";

/**
 * Qué se cobró cuando la demo falla. x402 solo liquida si el build responde por debajo de 400
 * (D17): "nada" solo si el backend contestó con un error; sin respuesta (corte de Netlify a
 * ~10 s, red) o con un 2xx ilegible no se sabe. Después del build, la comisión ya se pagó.
 */
export function chargeNote(failedAt: DemoStatus, error: DemoError): string | null {
  if (failedAt === "idle" || failedAt === "setup") return null;
  if (paymentMayHaveSettled(failedAt, error)) {
    return "We could not confirm whether the payment settled: x402 only charges when the build succeeds. Start over instead of trying again, so the agent is not charged twice.";
  }
  if (failedAt === "paying") {
    return "Nothing was charged: x402 only settles the payment when the build succeeds.";
  }
  return "The recipe fee was already paid when this transaction was built.";
}

/**
 * Falló al pagar sin un rechazo claro del backend (D17): el pago pudo liquidarse. Entonces no
 * se ofrece "Try again", que volvería a pagar (#44); solo "Start over".
 */
export function paymentMayHaveSettled(failedAt: DemoStatus, error: DemoError): boolean {
  return failedAt === "paying" && !error.rejected;
}

/** La nota de cobro de la tarjeta de error; en mock dice que no se cobra de verdad. */
export function chargeLine(
  failedAt: DemoStatus,
  error: DemoError,
  mode: ApiMode,
  fee: string,
): string | null {
  const note = chargeNote(failedAt, error);
  if (mode !== "mock" || note === null) return note;
  return failedAt === "paying" ? `Simulated in mock mode. ${note}` : mockPaymentNote(fee);
}

/**
 * Lo que anuncia la región aria-live del panel: solo lo que no dice ya el título que recibe el
 * foco ni Busy (role="status"). Un solo canal por paso, para no oír lo mismo dos o tres veces.
 */
export function stepAnnouncement(state: DemoState): string {
  switch (state.status) {
    case "built":
      // El foco cae en "x402 payment": la región dice que ya se puede firmar.
      return "Transaction ready to sign";
    case "reverted":
      return describeRevert(state.run, state.failure).detail;
    case "error":
      return humanError(state.error).hint;
    case "expired":
      return "Rebuild it for free, or start over.";
    default:
      return "";
  }
}

export type RevertCopy = {
  title: string;
  detail: string;
  byGuard: boolean;
  figures: RevertFigures | null;
};

/** D15: "guard" solo si la cadena dice que falló el guard; si no, el paso que falló. */
export function describeRevert(run: Run, failure: RevertFailure): RevertCopy {
  if (failure.guard) {
    // D15: las dos cifras salen de lo que leyó la cadena (GUARD_FAIL), no del build.
    const { received, min: minimum } = failure.guard;
    const shortfall = minimum > received ? minimum - received : 0n;
    const figures = {
      received: formatUnits(received, USDC_DECIMALS),
      minimum: formatUnits(minimum, USDC_DECIMALS),
      shortfall: formatUnits(shortfall, USDC_DECIMALS),
    };
    return {
      title: "The guard protected the agent",
      detail: `The agent would have received ${figures.received} ${POOL_TOKEN}, below the ${figures.minimum} ${POOL_TOKEN} minimum, so the whole transaction was rolled back.`,
      byGuard: true,
      figures,
    };
  }
  const detail = "The whole transaction was rolled back, so no step took effect.";
  if (failure.instructionIndex === null) {
    return { title: "The transaction failed on-chain", detail, byGuard: false, figures: null };
  }
  const step = run.build.steps.find((s) => s.index === failure.instructionIndex);
  const title = step
    ? `Step ${step.index} · ${step.label} (${step.protocol}) failed`
    : `Instruction ${failure.instructionIndex} failed`;
  return { title, detail, byGuard: false, figures: null };
}

/** Comisión de la receta, cobrada con x402 en USDC de Circle. */
export function formatFee(price: Recipe["price"]): string {
  return `${formatUnits(price.amount, USDC_DECIMALS)} USDC`;
}

/** "Run again" cobra otra vez (la ventana gratis ya pasó, D19); en mock no cobra nada. */
export function runAgainNote(fee: string, mode: ApiMode): string {
  if (mode === "mock") {
    return `Run again builds a new transaction. Mock mode charges nothing; in devnet mode it pays ${fee} again.`;
  }
  return `Run again pays ${fee} again for a new transaction.`;
}

/** El coste del pago en mock, dicho una sola vez y igual en la línea de tiempo y en el resultado. */
export function mockPaymentNote(fee: string): string {
  return `Simulated: mock mode charges nothing. In devnet mode the agent pays ${fee} per request.`;
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
