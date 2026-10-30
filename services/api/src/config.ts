import { Address } from "@xargos/shared";
import { z } from "zod";

const BaseUnitsNumber = z.string().regex(/^\d+$/).transform(BigInt);

/** Environment of the API. Anything missing or malformed stops the boot (lesson 8). */
export const ConfigSchema = z.object({
  SOLANA_CLUSTER: z.literal("devnet"),
  RPC_URL: z.url(),
  PAYER_KEYPAIR_PATH: z.string().min(1),
  USDC_MINT: Address,
  DEMO_USDC_MINT: Address,
  GUARD_PROGRAM_ID: Address,
  WHIRLPOOL_ADDRESS: Address,
  /** Address that receives the x402 payments. */
  PAY_TO_ADDRESS: Address,
  /** Recipe price in base units of Circle's USDC (10000 = 0.01 USDC). */
  RECIPE_PRICE_BASE_UNITS: BaseUnitsNumber.default(10_000n),
  DEMO_ACCESS_CODE: z.string().min(1).optional(),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  SETUP_RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).default(10),
  SETUP_MAX_JOBS: z.coerce.number().int().min(1).default(200),
  FUND_SOL_LAMPORTS: BaseUnitsNumber.default(20_000_000n),
  FUND_USDC_BASE: BaseUnitsNumber.default(50_000n),
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
  return result.data;
}
