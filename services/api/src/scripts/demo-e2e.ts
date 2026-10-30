// End to end on devnet: a brand new agent goes through /demo/setup's phases (timed), then the exit
// recipe is built for it, signed by that agent and confirmed. Run: pnpm --filter @xargos/api demo:e2e
// FUND_USDC_BASE (default 0) is the Circle USDC sent to the agent; the facilitator needs it first.
import {
  address,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getSignatureFromTransaction,
  getTransactionDecoder,
  signTransaction,
} from "@solana/kit";
import { runSetup } from "../demo/setup-runner";
import { createSetupSteps } from "../demo/steps";
import { createExitOrcaLpRecipe } from "../recipes/exit-orca-lp";
import { buildResponse } from "../solana/build-transaction";
import { createSender } from "../solana/send";
import { SetupJobs } from "../store/setup-jobs";
import { DEMO_USDC_MINT, explorerTx, RPC_URL, USDC_MINT, useFacilitator } from "./orca/common";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`set ${name} (see .env.example)`);
  return value;
};

const payer = await useFacilitator();
const rpc = createSolanaRpc(RPC_URL);
const rpcSubscriptions = createSolanaRpcSubscriptions(RPC_URL.replace(/^http/, "ws"));
const whirlpool = address(required("WHIRLPOOL_ADDRESS"));
const guardProgram = address(required("GUARD_PROGRAM_ID"));

const steps = createSetupSteps({
  rpc,
  send: createSender(rpc, rpcSubscriptions, payer),
  payer,
  circleUsdc: USDC_MINT,
  demoUsdc: DEMO_USDC_MINT,
  whirlpool,
  guardProgram,
  fundSolLamports: 20_000_000n,
  fundUsdcBase: BigInt(process.env.FUND_USDC_BASE ?? 0),
  positionSolLamports: 50_000_000n,
});

const agent = await generateKeyPairSigner();
console.log("new agent:", agent.address);

// Setup, timing each phase from the job store.
const jobs = new SetupJobs();
jobs.create(agent.address);
const started = Date.now();
let lastPhase = "";
const watcher = setInterval(() => {
  const phase = jobs.get(agent.address)?.phase ?? "";
  if (phase !== lastPhase) {
    lastPhase = phase;
    console.log(`  +${((Date.now() - started) / 1000).toFixed(1)}s  ${phase}`);
  }
}, 100);
await runSetup(jobs, steps, agent.address, {
  error: (data, message) => console.error(message, data),
});
clearInterval(watcher);
const job = jobs.get(agent.address);
console.log(`setup ${job?.phase} in ${((Date.now() - started) / 1000).toFixed(1)}s`, job);
if (job?.phase !== "ready" || !job.position) throw new Error("setup did not finish");

// The exit recipe for that agent, signed by the agent (never by the backend).
const recipe = createExitOrcaLpRecipe({
  rpc,
  whirlpool,
  usdcMint: DEMO_USDC_MINT,
  guardProgram,
  priceAmount: "10000",
  priceMint: USDC_MINT,
});
const response = await buildResponse({
  recipe,
  context: { agent: agent.address, position: address(job.position) },
  buildId: `bld_${Date.now()}`,
  rpc,
});
console.log(
  "build ok:",
  response.transaction.length,
  "base64 chars; minDelta",
  response.guard.minDelta,
);

const decoded = getTransactionDecoder().decode(getBase64Encoder().encode(response.transaction));
const signed = await signTransaction([agent.keyPair], decoded);
const signature = getSignatureFromTransaction(signed);
await rpc
  .sendTransaction(getBase64EncodedWireTransaction(signed), {
    encoding: "base64",
    preflightCommitment: "confirmed",
  })
  .send();
for (let attempt = 0; attempt < 40; attempt++) {
  const status = (await rpc.getSignatureStatuses([signature]).send()).value[0];
  if (status?.err) throw new Error("recipe transaction failed");
  if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
    console.log("recipe confirmed:", explorerTx(signature));
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
}
