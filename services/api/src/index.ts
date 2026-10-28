import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import {
  address,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
} from "@solana/kit";
import { createApp } from "./app";
import { parseConfig } from "./config";
import { createSetupSteps } from "./demo/steps";
import { createSender } from "./solana/send";

const config = parseConfig(process.env);
const payer = await createKeyPairSignerFromBytes(
  Uint8Array.from(JSON.parse(readFileSync(config.PAYER_KEYPAIR_PATH, "utf8"))),
);
const rpc = createSolanaRpc(config.RPC_URL);
const rpcSubscriptions = createSolanaRpcSubscriptions(config.RPC_URL.replace(/^http/, "ws"));

const app = createApp({
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
