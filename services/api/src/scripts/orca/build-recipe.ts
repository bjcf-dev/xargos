// Builds the exit recipe for the facilitator's test position and simulates it (B6). Run:
//   pnpm --filter @xargos/api orca:build-recipe
import { address, createSolanaRpc } from "@solana/kit";
import { createExitOrcaLpRecipe } from "../../recipes/exit-orca-lp";
import { buildResponse } from "../../solana/build-transaction";
import { DEMO_USDC_MINT, RPC_URL, USDC_MINT, useFacilitator } from "./common";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`set ${name} (see .env.example)`);
  return value;
};

const agent = (await useFacilitator()).address; // the test agent owns the test position
const rpc = createSolanaRpc(RPC_URL);
const recipe = createExitOrcaLpRecipe({
  rpc,
  whirlpool: address(required("WHIRLPOOL_ADDRESS")),
  usdcMint: DEMO_USDC_MINT,
  guardProgram: address(required("GUARD_PROGRAM_ID")),
  priceAmount: "10000",
  priceMint: USDC_MINT,
});

const response = await buildResponse({
  recipe,
  context: { agent, position: address(required("TEST_POSITION")) },
  buildId: `bld_${Date.now()}`,
  rpc,
});
console.log(
  JSON.stringify({ ...response, transaction: `${response.transaction.slice(0, 24)}...` }, null, 2),
);
const bytes = Buffer.from(response.transaction, "base64").length;
console.log("transaction bytes:", bytes);

const sim = await rpc
  .simulateTransaction(response.transaction as never, {
    encoding: "base64",
    sigVerify: false,
    replaceRecentBlockhash: true,
  })
  .send();
console.log("simulation err:", JSON.stringify(sim.value.err), "units:", sim.value.unitsConsumed);
console.log((sim.value.logs ?? []).slice(-6).join("\n"));
