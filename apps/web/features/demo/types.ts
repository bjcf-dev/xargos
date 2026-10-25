import type { BuildResponse, DemoSetupStatus, ErrorCode, PriceShockStatus } from "@xargos/shared";

/** Error de la demo: siempre un ErrorCode del contrato, para tener un mensaje por código. */
export type DemoError = { code: ErrorCode; message: string };

/** Lo que se arrastra desde que hay build: el agente, su posición, la tx y el recibo x402. */
export type Run = {
  agent: string;
  position: string;
  build: BuildResponse;
  /** Cabecera PAYMENT-RESPONSE del primer pago; el rebuild no vuelve a cobrar (D19). */
  paymentResponse?: string;
};

/** Qué dice la cadena del revert (D15): solo se habla del guard si falló el guard. */
export type RevertFailure = {
  /** Índice de InstructionError; null si la cadena no lo da. */
  instructionIndex: number | null;
  /** parseGuardFail(logs); null si el que falló no fue el guard. */
  guard: { received: bigint; min: bigint } | null;
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
  | { status: "built"; run: Run; shock?: PriceShockStatus }
  | { status: "shocking"; run: Run; shockId: string }
  | { status: "signing"; run: Run; shock?: PriceShockStatus }
  | { status: "confirmed"; run: Run; signature: string }
  | { status: "reverted"; run: Run; signature: string; failure: RevertFailure }
  | { status: "expired"; run: Run }
  | { status: "rebuilding"; run: Run }
  | { status: "error"; error: DemoError; failedAt: DemoStatus; agent?: string };

export type DemoEvent =
  | { type: "SETUP_STARTED"; agent: string }
  | { type: "SETUP_PROGRESS"; setup: DemoSetupStatus }
  | { type: "PAY" }
  | { type: "BUILT"; build: BuildResponse; paymentResponse?: string }
  | { type: "SHOCK_STARTED"; shockId: string }
  | { type: "SHOCK_SETTLED"; shock: PriceShockStatus }
  | { type: "SIGN" }
  | { type: "CONFIRMED"; signature: string }
  | { type: "REVERTED"; signature: string; failure: RevertFailure }
  | { type: "EXPIRED" }
  /** `now` lo pone quien despacha: el reducer es puro, sin Date.now(). */
  | { type: "REBUILD"; now: number }
  | { type: "FAILED"; error: DemoError }
  | { type: "RESET" };

export const initialDemoState: DemoState = { status: "idle" };
