import { serve } from "@hono/node-server";
import { setNativeMintWrappingStrategy } from "@orca-so/whirlpools";
import { fetchWhirlpool } from "@orca-so/whirlpools-client";
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
import { createPayerFunds } from "./demo/funds";
import { createPoolPrice } from "./demo/pool-price";
import { ShockGate, ShockJobs } from "./demo/shock";
import { createShockSteps } from "./demo/shock-steps";
import { createSetupSteps } from "./demo/steps";
import { createAuroraClient } from "./fund/aurora";
import { safeLog } from "./http/log";
import { RateLimiter } from "./http/rate-limit";
import { asFacilitatorClient } from "./payment/local-facilitator";
import { createExitOrcaLpRecipe } from "./recipes/exit-orca-lp";
import { createFundRoutes } from "./routes/fund";
import { createRecipeRoutes } from "./routes/recipes";
import { createShockRoutes } from "./routes/shock";
import { assertDevnet } from "./solana/assert-devnet";
import { readPayerBytes } from "./solana/payer";
import { createSender } from "./solana/send";
import { createSerial } from "./solana/serial";
import { BuildStore } from "./store/build-store";

const config = parseConfig(process.env);
const rpc = createSolanaRpc(config.RPC_URL);
// SOLANA_CLUSTER is only an env var: ask the RPC itself before any key is read or any SOL moves.
await assertDevnet(rpc);
const payer = await createKeyPairSignerFromBytes(readPayerBytes(config));
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
// The SDK setting is global. With the ATA the agent signs alone and the tx stays small; set once.
setNativeMintWrappingStrategy("ata");
const payerSerial = createSerial();

// Aurora (D31): only HTTP to its API. Without a key the routes exist and answer FUND_UNAVAILABLE.
const MINUTE_MS = 60 * 1000;
const fundRoutes = createFundRoutes({
  client: config.AURORA_API_KEY
    ? createAuroraClient({
        apiUrl: config.AURORA_API_URL,
        apiKey: config.AURORA_API_KEY,
        log: safeLog,
      })
    : undefined,
  originChains: config.AURORA_ORIGIN_CHAINS,
  minUsd: config.AURORA_MIN_USD,
  maxUsd: config.AURORA_MAX_USD,
  slippageBps: config.AURORA_SLIPPAGE_BPS,
  proxySecret: config.PROXY_SHARED_SECRET,
  quoteLimiter: new RateLimiter(10, 60 * MINUTE_MS),
  statusLimiter: new RateLimiter(60, MINUTE_MS),
  globalQuoteLimiter: new RateLimiter(200, 60 * MINUTE_MS),
});

const app = createApp({
  fundRoutes,
  shockRoutes: createShockRoutes({
    jobs: new ShockJobs(),
    gate: new ShockGate(),
    steps: createShockSteps({
      rpc,
      send: createSender(rpc, rpcSubscriptions, payer, { log: safeLog }),
      payer,
      whirlpool: address(config.WHIRLPOOL_ADDRESS),
      demoUsdc: address(config.DEMO_USDC_MINT),
      dropBps: config.SHOCK_DROP_BPS,
      serial: payerSerial,
    }),
    store: buildStore,
    limiter: new RateLimiter(config.SHOCK_RATE_LIMIT_PER_HOUR, 60 * 60 * 1000),
    cooldownMs: config.SHOCK_COOLDOWN_MS,
    accessCode: config.DEMO_ACCESS_CODE,
    log: safeLog,
  }),
  recipeRoutes: createRecipeRoutes({
    recipes: [recipe],
    rpc,
    store: buildStore,
    facilitator: asFacilitatorClient(facilitator),
    payTo: config.PAY_TO_ADDRESS,
    price: `$${dollars}`,
    publicUrl: config.PUBLIC_RESOURCE_URL,
    log: safeLog,
  }),
  steps: createSetupSteps({
    rpc,
    send: createSender(rpc, rpcSubscriptions, payer, { log: safeLog }),
    payer,
    circleUsdc: address(config.USDC_MINT),
    demoUsdc: address(config.DEMO_USDC_MINT),
    whirlpool: address(config.WHIRLPOOL_ADDRESS),
    guardProgram: address(config.GUARD_PROGRAM_ID),
    fundSolLamports: config.FUND_SOL_LAMPORTS,
    fundUsdcBase: config.FUND_USDC_BASE,
    positionSolLamports: config.POSITION_SOL_LAMPORTS,
    serial: payerSerial,
  }),
  accessCode: config.DEMO_ACCESS_CODE,
  setupRateLimitPerHour: config.SETUP_RATE_LIMIT_PER_HOUR,
  setupGlobalLimitPerHour: config.SETUP_GLOBAL_LIMIT_PER_HOUR,
  poolPrice: createPoolPrice({
    readSqrtPrice: async () =>
      (await fetchWhirlpool(rpc, address(config.WHIRLPOOL_ADDRESS))).data.sqrtPrice,
  }),
  funds: createPayerFunds({
    rpc,
    payer: payer.address,
    circleUsdc: address(config.USDC_MINT),
    minLamports: config.MIN_PAYER_LAMPORTS,
  }),
  setupMaxJobs: config.SETUP_MAX_JOBS,
  log: safeLog,
});

serve({ fetch: app.fetch, port: config.PORT });
console.log(`xARGOS api listening on :${config.PORT} (devnet, payer ${payer.address})`);
