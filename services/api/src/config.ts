import { Address } from "@xargos/shared";
import { z } from "zod";

const BaseUnitsNumber = z.string().regex(/^\d+$/).transform(BigInt);

/** Environment of the API. Anything missing or malformed stops the boot (lesson 8). */
export const ConfigSchema = z.object({
  SOLANA_CLUSTER: z.literal("devnet"),
  /**
   * Defaults to production on purpose: forgetting it must not open the paid endpoints. Only
   * APP_ENV=local may run without DEMO_ACCESS_CODE.
   */
  APP_ENV: z.enum(["local", "staging", "production"]).default("production"),
  RPC_URL: z.url(),
  /** Local runs: path to the payer keypair file. Railway has no files: use PAYER_KEYPAIR there. */
  PAYER_KEYPAIR_PATH: z.string().min(1).optional(),
  /** The payer keypair as a JSON array of bytes, set only in the host's variables panel. */
  PAYER_KEYPAIR: z.string().min(1).optional(),
  USDC_MINT: Address,
  DEMO_USDC_MINT: Address,
  GUARD_PROGRAM_ID: Address,
  WHIRLPOOL_ADDRESS: Address,
  /** Address that receives the x402 payments. */
  PAY_TO_ADDRESS: Address,
  /** Recipe price in base units of Circle's USDC (10000 = 0.01 USDC). */
  RECIPE_PRICE_BASE_UNITS: BaseUnitsNumber.default(10_000n),
  /** Public base URL the agent calls (the Netlify proxy), e.g. https://app.netlify.app/api/xargos (D20). */
  PUBLIC_RESOURCE_URL: z.url().optional(),
  DEMO_ACCESS_CODE: z.string().min(1).optional(),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  SETUP_RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).default(10),
  SETUP_MAX_JOBS: z.coerce.number().int().min(1).default(200),
  FUND_SOL_LAMPORTS: BaseUnitsNumber.default(20_000_000n),
  FUND_USDC_BASE: BaseUnitsNumber.default(50_000n),
  /** How far the shock drops the pool price. 600 = 6%: well above the guard's 1% (D10). */
  SHOCK_DROP_BPS: z.coerce.number().int().min(100).max(5_000).default(600),
  /** Time the pool stays shocked before it is restored: longer than the 120 s free rebuild. */
  SHOCK_COOLDOWN_MS: z.coerce.number().int().min(1_000).default(150_000),
  SHOCK_RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).default(30),
  /** Enough for a clear demo; the payer does not get this back, so it sets the cost per run. */
  POSITION_SOL_LAMPORTS: BaseUnitsNumber.default(20_000_000n),
  /** Below this SOL balance the payer refuses new setups with a clear error. */
  MIN_PAYER_LAMPORTS: BaseUnitsNumber.default(500_000_000n),
  /** Setups per hour across every client, on top of the limit per IP. */
  SETUP_GLOBAL_LIMIT_PER_HOUR: z.coerce.number().int().min(1).default(60),
});
export type Config = z.infer<typeof ConfigSchema>;

export function parseConfig(env: Record<string, string | undefined>): Config {
  // `NAME=` in a .env file reaches us as "", which means "not set", not an invalid value.
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""));
  const result = ConfigSchema.safeParse(present);
  if (!result.success) {
    // Names of the bad variables only: never the values (they may hold keys or API tokens).
    const names = [...new Set(result.error.issues.map((i) => i.path.join(".")))];
    throw new Error(`Invalid configuration: ${names.join(", ")}`);
  }
  const { PAYER_KEYPAIR, PAYER_KEYPAIR_PATH, APP_ENV, DEMO_ACCESS_CODE } = result.data;
  if (Boolean(PAYER_KEYPAIR) === Boolean(PAYER_KEYPAIR_PATH)) {
    throw new Error("Invalid configuration: set exactly one of PAYER_KEYPAIR_PATH, PAYER_KEYPAIR");
  }
  if (APP_ENV !== "local" && !DEMO_ACCESS_CODE) {
    throw new Error(`Invalid configuration: DEMO_ACCESS_CODE is required when APP_ENV=${APP_ENV}`);
  }
  return result.data;
}
