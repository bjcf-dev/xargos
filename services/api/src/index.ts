import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import {
  address,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
} from "@solana/kit";
import { x402Facilitator } from "@x402/core/facilitator";
import { SOLANA_DEVNET_CAIP2, toFacilitatorSvmSigner } from "@x402/svm";
import { registerExactSvmScheme as registerFacilitator } from "@x402/svm/exact/facilitator";
import { createApp } from "./app";
import { parseConfig } from "./config";
import { ShockGate, ShockJobs } from "./demo/shock";
import { createShockSteps } from "./demo/shock-steps";
import { createSetupSteps } from "./demo/steps";
import { RateLimiter } from "./http/rate-limit";
import { asFacilitatorClient } from "./payment/local-facilitator";
import { createExitOrcaLpRecipe } from "./recipes/exit-orca-lp";
import { createRecipeRoutes } from "./routes/recipes";
import { createShockRoutes } from "./routes/shock";
import { assertDevnet } from "./solana/assert-devnet";
import { createSender } from "./solana/send";
import { BuildStore } from "./store/build-store";

const config = parseConfig(process.env);
if (!config.DEMO_ACCESS_CODE) {
  // Without the code anyone can start setups that cost the payer SOL: fine locally, not in Railway.
  console.warn("DEMO_ACCESS_CODE is not set: /demo/setup is open to anyone");
}
const rpc = createSolanaRpc(config.RPC_URL);
// SOLANA_CLUSTER is only an env var: ask the RPC itself before any key is read or any SOL moves.
await assertDevnet(rpc);
const payer = await createKeyPairSignerFromBytes(
  Uint8Array.from(JSON.parse(readFileSync(config.PAYER_KEYPAIR_PATH, "utf8"))),
);
const rpcSubscriptions = createSolanaRpcSubscriptions(config.RPC_URL.replace(/^http/, "ws"));

// x402: the backend settles its own payments with the payer key (ADR 0001, D18).
const facilitator = new x402Facilitator();
registerFacilitator(facilitator, {
  signer: toFacilitatorSvmSigner(payer),
  networks: SOLANA_DEVNET_CAIP2,
});
const recipe = createExitOrcaLpRecipe({
  rpc,
  whirlpool: address(config.WHIRLPOOL_ADDRESS),
  usdcMint: address(config.DEMO_USDC_MINT),
  guardProgram: address(config.GUARD_PROGRAM_ID),
  priceAmount: config.RECIPE_PRICE_BASE_UNITS.toString(),
  priceMint: address(config.USDC_MINT),
});
const dollars = (Number(config.RECIPE_PRICE_BASE_UNITS) / 1_000_000).toFixed(6);

const buildStore = new BuildStore();
const log = { error: (data: object, message: string) => console.error(message, data) };

const app = createApp({
  shockRoutes: createShockRoutes({
    jobs: new ShockJobs(),
    gate: new ShockGate(),
    steps: createShockSteps({
      rpc,
      send: createSender(rpc, rpcSubscriptions, payer),
      payer,
      whirlpool: address(config.WHIRLPOOL_ADDRESS),
      demoUsdc: address(config.DEMO_USDC_MINT),
      dropBps: config.SHOCK_DROP_BPS,
    }),
    store: buildStore,
    limiter: new RateLimiter(config.SHOCK_RATE_LIMIT_PER_HOUR, 60 * 60 * 1000),
    cooldownMs: config.SHOCK_COOLDOWN_MS,
    accessCode: config.DEMO_ACCESS_CODE,
    log,
  }),
  recipeRoutes: createRecipeRoutes({
    recipes: [recipe],
    rpc,
    store: buildStore,
    facilitator: asFacilitatorClient(facilitator),
    payTo: config.PAY_TO_ADDRESS,
    price: `$${dollars}`,
    log: { error: (data, message) => console.error(message, data) },
  }),
  steps: createSetupSteps({
    rpc,
    send: createSender(rpc, rpcSubscriptions, payer),
    payer,
    circleUsdc: address(config.USDC_MINT),
    demoUsdc: address(config.DEMO_USDC_MINT),
    whirlpool: address(config.WHIRLPOOL_ADDRESS),
    guardProgram: address(config.GUARD_PROGRAM_ID),
    fundSolLamports: config.FUND_SOL_LAMPORTS,
    fundUsdcBase: config.FUND_USDC_BASE,
    positionSolLamports: config.POSITION_SOL_LAMPORTS,
  }),
  accessCode: config.DEMO_ACCESS_CODE,
  setupRateLimitPerHour: config.SETUP_RATE_LIMIT_PER_HOUR,
  setupMaxJobs: config.SETUP_MAX_JOBS,
  // Never log keys, RPC URLs with a token or the access code: only what setup reports.
  log: { error: (data, message) => console.error(message, data) },
});

serve({ fetch: app.fetch, port: config.PORT });
console.log(`xARGOS api listening on :${config.PORT} (devnet, payer ${payer.address})`);
