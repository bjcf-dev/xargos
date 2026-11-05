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

// ---------- Fund (Aurora Intents, D31) ----------
// Fondear al agente desde otra cadena con la Swap API de Aurora. Corre en mainnet con fondos del
// usuario; xARGOS solo cotiza y consulta el estado, nunca custodia ni firma (D31).

/** Los 7 estados de Aurora (GET /api/status), tal cual. */
export const FundStatus = z.enum([
  "PENDING_DEPOSIT",
  "KNOWN_DEPOSIT_TX",
  "INCOMPLETE_DEPOSIT",
  "PROCESSING",
  "SUCCESS",
  "REFUNDED",
  "FAILED",
]);
export type FundStatus = z.infer<typeof FundStatus>;

/** Estados en los que Aurora ya no cambia nada: el front deja de consultar. */
export const FUND_FINAL_STATUSES: readonly FundStatus[] = ["SUCCESS", "REFUNDED", "FAILED"];

/** Dirección EVM (Base, Arbitrum, Ethereum): adonde Aurora reembolsa. */
export const EvmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Invalid EVM address");
export type EvmAddress = z.infer<typeof EvmAddress>;

/** Un token de Aurora. `assetId` es su identificador, nunca el mint ni el contrato. */
export const FundAsset = z.object({
  assetId: z.string().min(1),
  symbol: z.string().min(1),
  /** Slug de la cadena según Aurora (`sol`, `base`, `arb`, `eth`). */
  blockchain: z.string().min(1),
  decimals: z.number().int().min(0).max(36),
  /** Precio en USD que da Aurora; solo orientativo. */
  priceUsd: z.number().nonnegative(),
});
export type FundAsset = z.infer<typeof FundAsset>;

export const FundAssetsResponse = z.object({
  /** USDC en Solana: lo único que se recibe. */
  destination: FundAsset,
  origins: z.array(FundAsset).min(1),
});
export type FundAssetsResponse = z.infer<typeof FundAssetsResponse>;

export const FundQuoteRequest = z.object({
  originAsset: z.string().min(1),
  /** Unidades base del token de origen. El backend comprueba el rango en USD. */
  amount: z.string().regex(/^0*[1-9]\d*$/, "Amount must be base units greater than zero"),
  /** Quien recibe el USDC en Solana. Lo escribe el usuario: nunca la clave del agente de la demo. */
  recipient: Address,
  refundTo: EvmAddress,
  /** true: solo precio, sin dirección de depósito ni movimiento de fondos. */
  dry: z.boolean(),
});
export type FundQuoteRequest = z.infer<typeof FundQuoteRequest>;

export const FundQuote = z
  .object({
    dry: z.boolean(),
    originAsset: z.string().min(1),
    destinationAsset: z.string().min(1),
    recipient: Address,
    refundTo: EvmAddress,
    amountIn: BaseUnits,
    amountInFormatted: z.string().min(1),
    amountInUsd: z.string().min(1),
    amountOut: BaseUnits,
    amountOutFormatted: z.string().min(1),
    amountOutUsd: z.string().min(1),
    /** Lo mínimo que llega con el slippage aceptado. */
    minAmountOut: BaseUnits,
    /**
     * Lo que cobra Aurora por entregar en Solana, en unidades del token de destino. Ya está
     * descontado de `amountOut`: con 2 USDC son ~0,25, así que la pantalla debe enseñarlo (paso 0).
     */
    withdrawFee: BaseUnits.optional(),
    /** Lo que se descontaría de un reembolso, en unidades del token de origen. */
    refundFee: BaseUnits.optional(),
    timeEstimateSeconds: z.number().nonnegative(),
    /** Solo con dry: false. Adonde el usuario envía los fondos, en la cadena de origen. */
    depositAddress: z.string().min(1).optional(),
    depositMemo: z.string().min(1).optional(),
    /**
     * Hasta aquí se envía: un depósito que llega después se reembolsa (Aurora, 4 nov). Manda en la
     * cuenta atrás de la pantalla.
     */
    deadline: IsoDate.optional(),
    /**
     * Desde aquí Aurora deja de vigilar la dirección: un depósito puede necesitar un reembolso
     * manual. Nunca enviar después.
     */
    timeWhenInactive: IsoDate.optional(),
    /** Id de Aurora para el soporte y los logs. */
    correlationId: z.string().min(1).optional(),
  })
  .refine((quote) => quote.dry === (quote.depositAddress === undefined), {
    message: "A real quote has a deposit address and a dry one never does",
    path: ["depositAddress"],
  });
export type FundQuote = z.infer<typeof FundQuote>;

/** Una transacción de Aurora con su enlace. Solo https: el front lo pone en un <a>. */
export const FundTx = z.object({
  hash: z.string().min(1),
  explorerUrl: z.url({ protocol: /^https$/ }),
});
export type FundTx = z.infer<typeof FundTx>;

export const FundStatusResponse = z.object({
  depositAddress: z.string().min(1),
  depositMemo: z.string().min(1).optional(),
  status: FundStatus,
  /** Opcional: la respuesta corta de Aurora solo trae `status`. */
  updatedAt: IsoDate.optional(),
  /** Lo que pidió la cotización. */
  amountIn: BaseUnits.optional(),
  amountInFormatted: z.string().min(1).optional(),
  /** Lo que ha llegado. En INCOMPLETE_DEPOSIT es menos que `amountIn`: se puede completar. */
  depositedAmount: BaseUnits.optional(),
  depositedAmountFormatted: z.string().min(1).optional(),
  amountOut: BaseUnits.optional(),
  amountOutFormatted: z.string().min(1).optional(),
  refundedAmount: BaseUnits.optional(),
  refundedAmountFormatted: z.string().min(1).optional(),
  refundReason: z.string().min(1).optional(),
  originTxs: z.array(FundTx),
  destinationTxs: z.array(FundTx),
  timeWhenInactive: IsoDate.optional(),
  deadline: IsoDate.optional(),
});
export type FundStatusResponse = z.infer<typeof FundStatusResponse>;

/** Avisar a Aurora del depósito para que lo detecte antes (opcional). */
export const FundDepositRequest = z.object({
  depositAddress: z.string().min(1),
  depositMemo: z.string().min(1).optional(),
  txHash: z.string().min(1),
});
export type FundDepositRequest = z.infer<typeof FundDepositRequest>;

// ---------- Rutas ----------

export const routes = {
  recipes: "/recipes",
  build: (recipeId: string) => `/recipes/${encodeURIComponent(recipeId)}/build`,
  demoSetup: "/demo/setup",
  demoSetupStatus: (agent: string) => `/demo/setup/${encodeURIComponent(agent)}`,
  priceShock: "/demo/price-shock",
  priceShockStatus: (shockId: string) => `/demo/price-shock/${encodeURIComponent(shockId)}`,
  fund: {
    assets: "/fund/assets",
    quote: "/fund/quote",
    status: (depositAddress: string, memo?: string) =>
      `/fund/status/${encodeURIComponent(depositAddress)}${
        memo ? `?memo=${encodeURIComponent(memo)}` : ""
      }`,
    deposit: "/fund/deposit",
  },
} as const;
