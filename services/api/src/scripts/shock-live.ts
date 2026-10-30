// Calibration on devnet: shock the pool, print the prices, wait a little and restore. Run:
//   pnpm --filter @xargos/api demo:shock   (SHOCK_DROP_BPS, default 600)
import { address, createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { createShockSteps } from "../demo/shock-steps";
import { createSender } from "../solana/send";
import { DEMO_USDC_MINT, explorerTx, RPC_URL, useFacilitator } from "./orca/common";

const payer = await useFacilitator();
const rpc = createSolanaRpc(RPC_URL);
const send = createSender(rpc, createSolanaRpcSubscriptions(RPC_URL.replace(/^http/, "ws")), payer);
const steps = createShockSteps({
  rpc,
  send,
  payer,
  whirlpool: address(process.env.WHIRLPOOL_ADDRESS ?? ""),
  demoUsdc: DEMO_USDC_MINT,
  dropBps: Number(process.env.SHOCK_DROP_BPS ?? 600),
});

if (process.env.RESTORE_TO) {
  await steps.restoreTo(Number(process.env.RESTORE_TO));
  console.log("pool restored to", process.env.RESTORE_TO);
  process.exit(0);
}

const shock = await steps.shock();
console.log(
  "shock:",
  shock.priceBefore,
  "->",
  shock.priceAfter,
  shock.signature ? explorerTx(shock.signature) : "(nothing to sell)",
);
await steps.restore();
console.log("restored");
