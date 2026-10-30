import type { BuildResponse, DemoSetupStatus, ErrorCode, PriceShockStatus } from "@xargos/shared";

/** Error de la demo: siempre un ErrorCode del contrato, para tener un mensaje por código. */
export type DemoError = {
  code: ErrorCode;
  message: string;
  /** Segundos de Retry-After (RATE_LIMITED), si el backend los dio. */
  retryAfterSeconds?: number;
  /** El backend no contestó: manda sobre el código, que entonces es INTERNAL. */
  unreachable?: true;
  /** El backend contestó con un error: x402 no liquidó el pago (D17). */
  rejected?: true;
};

/** Lo que se arrastra desde que hay build: el agente, su posición, la tx y el recibo x402. */
export type Run = {
  agent: string;
  position: string;
  build: BuildResponse;
  /** Cabecera PAYMENT-RESPONSE del primer pago; el rebuild no vuelve a cobrar (D19). */
  paymentResponse?: string;
  /** Price shock de la demo B (D10). Vive en el run: uno por run, también tras un rebuild. */
  shock?: PriceShockStatus;
};

/**
 * Qué dice la cadena del revert (D15): solo se habla del guard si falló el guard.
 * `guard` usa bigint (unidades base exactas): JSON.stringify(state) lanza con bigint,
 * así que el estado de la demo no se serializa tal cual (sessionStorage, logs, server actions).
 */
export type RevertFailure = {
  /** Índice de InstructionError; null si la cadena no lo da. */
  instructionIndex: number | null;
  /** parseGuardFail(logs); null si el que falló no fue el guard. */
  guard: { received: bigint; min: bigint } | null;
  /** meta.fee de la tx (lamports, D16). Sin él (mock, o la cadena no lo dio), no se cifra. */
  networkFeeLamports?: bigint;
};

export type DemoStatus =
  | "idle"
  | "setup"
  | "paying"
  | "built"
  | "shocking"
  | "signing"
  | "confirmed"
  | "reverted"
  | "expired"
  | "rebuilding"
  | "error";

/**
 * Brief §6: idle → setup → paying → built → signing → confirmed | reverted | expired → rebuilding.
 * Además: `shocking` (price shock de la demo B, D10) y `error` (fallos de API con su ErrorCode).
 */
export type DemoState =
  | { status: "idle" }
  | { status: "setup"; agent: string; setup: DemoSetupStatus }
  | { status: "paying"; agent: string; position: string }
  | { status: "built"; run: Run }
  /** shockId null: el POST /demo/price-shock está en vuelo (aún sin 202). */
  | { status: "shocking"; run: Run; shockId: string | null }
  | { status: "signing"; run: Run }
  | { status: "confirmed"; run: Run; signature: string }
  | { status: "reverted"; run: Run; signature: string; failure: RevertFailure }
  /** `error`: falló un rebuild por algo pasajero; la ventana gratis sigue abierta. */
  | { status: "expired"; run: Run; error?: DemoError }
  | { status: "rebuilding"; run: Run }
  /** Guarda agente y posición si los había: así se puede volver a pagar sin otro setup. */
  | { status: "error"; error: DemoError; failedAt: DemoStatus; agent?: string; position?: string };

export type DemoEvent =
  | { type: "SETUP_STARTED"; agent: string }
  | { type: "SETUP_PROGRESS"; setup: DemoSetupStatus }
  | { type: "PAY" }
  | { type: "BUILT"; build: BuildResponse; paymentResponse?: string }
  | { type: "SHOCK_REQUESTED" }
  | { type: "SHOCK_ACCEPTED"; shockId: string }
  | { type: "SHOCK_SETTLED"; shock: PriceShockStatus }
  | { type: "SIGN" }
  | { type: "CONFIRMED"; signature: string }
  | { type: "REVERTED"; signature: string; failure: RevertFailure }
  /** `now` lo pone quien despacha: el reducer es puro, sin Date.now(). */
  | { type: "EXPIRED"; now: number }
  | { type: "REBUILD"; now: number }
  | { type: "FAILED"; error: DemoError }
  | { type: "RESET" };

export const initialDemoState: DemoState = { status: "idle" };
