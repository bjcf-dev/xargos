import { Address } from "@xargos/shared";
import { z } from "zod";

const BaseUnitsNumber = z.string().regex(/^\d+$/).transform(BigInt);

/** Environment of the API. Anything missing or malformed stops the boot (lesson 8). */
export const ConfigSchema = z.object({
  SOLANA_CLUSTER: z.literal("devnet"),
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
  POSITION_SOL_LAMPORTS: BaseUnitsNumber.default(50_000_000n),
});
export type Config = z.infer<typeof ConfigSchema>;

export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    // Names of the bad variables only: never the values (they may hold keys or API tokens).
    const names = [...new Set(result.error.issues.map((i) => i.path.join(".")))];
    throw new Error(`Invalid configuration: ${names.join(", ")}`);
  }
  if (!result.data.PAYER_KEYPAIR_PATH && !result.data.PAYER_KEYPAIR) {
    throw new Error("Invalid configuration: PAYER_KEYPAIR_PATH or PAYER_KEYPAIR");
  }
  return result.data;
}
