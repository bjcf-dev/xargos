import { z } from "zod";
import { ApiError } from "./errors";

/**
 * Contrato de API v3 entre apps/web y services/api.
 * Explicación en docs/api-contract.md. Cualquier cambio: PR propia aprobada por los dos.
 */

/** Dirección Solana en base58 (32–44 caracteres). */
export const Address = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana address");
export type Address = z.infer<typeof Address>;

/** Importe en unidades base, como string de dígitos (sin decimales). */
export const BaseUnits = z.string().regex(/^\d+$/, "Amount must be base units (digits only)");
export type BaseUnits = z.infer<typeof BaseUnits>;

export const IsoDate = z.iso.datetime();

// ---------- Recetas ----------

export const Recipe = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  price: z.object({ amount: BaseUnits, mint: Address }),
});
export type Recipe = z.infer<typeof Recipe>;

export const RecipeList = z.array(Recipe);

export const BuildRequest = z.object({
  agent: Address,
  position: Address,
  buildId: z.string().min(1).optional(),
});
export type BuildRequest = z.infer<typeof BuildRequest>;

export const StepKind = z.enum(["setup", "action", "guard"]);
export type StepKind = z.infer<typeof StepKind>;

export const Step = z.object({
  index: z.number().int().nonnegative(),
  label: z.string().min(1),
  protocol: z.string().min(1),
  programId: Address,
  kind: StepKind,
});
export type Step = z.infer<typeof Step>;

export const Guard = z.object({
  programId: Address,
  mint: Address,
  /** Cuenta de tokens (ATA) de USDC del agente: la que lee el guard y la que el front consulta para el saldo. NO es la wallet. */
  watchedAccount: Address,
  minDelta: BaseUnits,
  snapshotIndex: z.number().int().nonnegative(),
  assertIndex: z.number().int().nonnegative(),
});
export type Guard = z.infer<typeof Guard>;

export const Quote = z.object({
  tokenOut: Address,
  expectedOut: BaseUnits,
  slippageBps: z.number().int().min(0).max(10_000),
});
export type Quote = z.infer<typeof Quote>;

export const BuildResponse = z
  .object({
    buildId: z.string().min(1),
    recipeId: z.string().min(1),
    transaction: z.base64(),
    expiresAt: IsoDate,
    rebuildUntil: IsoDate,
    quote: Quote,
    guard: Guard,
    steps: z.array(Step).min(1),
    watchAccounts: z.array(Address),
  })
  .refine((b) => b.guard.snapshotIndex < b.guard.assertIndex, {
    message: "snapshot must come before assert",
    path: ["guard"],
  });
export type BuildResponse = z.infer<typeof BuildResponse>;

// ---------- Demo ----------

export const DemoSetupRequest = z.object({
  agent: Address,
  accessCode: z.string().min(1).optional(),
});
export type DemoSetupRequest = z.infer<typeof DemoSetupRequest>;

export const DemoSetupAccepted = z.object({ agent: Address });
export type DemoSetupAccepted = z.infer<typeof DemoSetupAccepted>;

export const DemoSetupPhase = z.enum([
  "queued",
  "funding_sol",
  "funding_usdc",
  "opening_position",
  "ready",
  "failed",
]);
export type DemoSetupPhase = z.infer<typeof DemoSetupPhase>;

export const DemoSetupStatus = z.object({
  agent: Address,
  phase: DemoSetupPhase,
  position: Address.optional(),
  balances: z.object({ sol: BaseUnits, usdc: BaseUnits }).optional(),
  error: ApiError.optional(),
});
export type DemoSetupStatus = z.infer<typeof DemoSetupStatus>;

export const PriceShockRequest = z.object({ agent: Address });
export type PriceShockRequest = z.infer<typeof PriceShockRequest>;

export const PriceShockAccepted = z.object({ shockId: z.string().min(1) });
export type PriceShockAccepted = z.infer<typeof PriceShockAccepted>;

export const PriceShockStatus = z.object({
  shockId: z.string().min(1),
  status: z.enum(["pending", "confirmed", "failed"]),
  signature: z.string().min(1).optional(),
  priceBefore: z.string().optional(),
  priceAfter: z.string().optional(),
  error: ApiError.optional(),
});
export type PriceShockStatus = z.infer<typeof PriceShockStatus>;

// ---------- Revert del guard ----------

const GUARD_FAIL_RE = /GUARD_FAIL received=(\d+) min=(\d+)/;

/** Busca el log del guard en meta.logMessages de getTransaction. */
export function parseGuardFail(
  logs: readonly string[] | null | undefined,
): { received: bigint; min: bigint } | null {
  for (const line of logs ?? []) {
    const m = GUARD_FAIL_RE.exec(line);
    if (m?.[1] && m[2]) return { received: BigInt(m[1]), min: BigInt(m[2]) };
  }
  return null;
}

// ---------- Rutas ----------

export const routes = {
  recipes: "/recipes",
  build: (recipeId: string) => `/recipes/${encodeURIComponent(recipeId)}/build`,
  demoSetup: "/demo/setup",
  demoSetupStatus: (agent: string) => `/demo/setup/${encodeURIComponent(agent)}`,
  priceShock: "/demo/price-shock",
  priceShockStatus: (shockId: string) => `/demo/price-shock/${encodeURIComponent(shockId)}`,
} as const;
