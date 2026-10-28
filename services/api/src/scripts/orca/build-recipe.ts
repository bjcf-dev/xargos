// Builds the exit recipe for the facilitator's test position and simulates it (B6). Run:
//   pnpm --filter @xargos/api orca:build-recipe
import {
  address,
  createSolanaRpc,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getSignatureFromTransaction,
  getTransactionDecoder,
  signTransaction,
} from "@solana/kit";
import { createExitOrcaLpRecipe } from "../../recipes/exit-orca-lp";
import { buildResponse } from "../../solana/build-transaction";
import { loadLookupTable } from "../../solana/lookup-table";
import { DEMO_USDC_MINT, explorerTx, RPC_URL, USDC_MINT, useFacilitator } from "./common";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`set ${name} (see .env.example)`);
  return value;
};

const payer = await useFacilitator(); // the test agent owns the test position
const agent = payer.address;
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
  ...(process.env.LOOKUP_TABLE_ADDRESS
    ? {
        lookupTables: await loadLookupTable(rpc, address(process.env.LOOKUP_TABLE_ADDRESS)),
      }
    : {}),
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
console.log(
  "simulation err:",
  JSON.stringify(sim.value.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  "units:",
  sim.value.unitsConsumed,
);
console.log((sim.value.logs ?? []).slice(-6).join("\n"));

// SEND=1: sign as the test agent and confirm on devnet (the criterion of B6).
if (process.env.SEND === "1") {
  const decoded = getTransactionDecoder().decode(getBase64Encoder().encode(response.transaction));
  const signed = await signTransaction([payer.keyPair], decoded);
  const signature = getSignatureFromTransaction(signed);
  await rpc
    .sendTransaction(getBase64EncodedWireTransaction(signed), {
      encoding: "base64",
      preflightCommitment: "confirmed",
    })
    .send();
  for (let attempt = 0; attempt < 40; attempt++) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (status?.err)
      throw new Error(
        `transaction failed: ${JSON.stringify(status.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`,
      );
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      console.log("confirmed:", explorerTx(signature));
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}
