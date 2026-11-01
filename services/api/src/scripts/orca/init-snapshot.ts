// Creates the guard snapshot PDA for an agent and the demo USDC mint (D8: the backend pays). Run:
//   AGENT_ADDRESS=<agent> pnpm --filter @xargos/api orca:init-snapshot
// Without AGENT_ADDRESS it uses the facilitator, which owns the test position.
import { address } from "@solana/kit";
import { findSnapshotStatePda, getInitSnapshotInstruction } from "@xargos/guard-client";
import { DEMO_USDC_MINT, explorerTx, rpc, useFacilitator } from "./common";
import { sendInstructions } from "./send";

const payer = await useFacilitator();
const guardProgram = address(process.env.GUARD_PROGRAM_ID ?? "");
const agent = address(process.env.AGENT_ADDRESS ?? payer.address);

const [snapshot] = await findSnapshotStatePda(
  { agent, mint: DEMO_USDC_MINT },
  { programAddress: guardProgram },
);
const existing = await rpc.getAccountInfo(snapshot, { encoding: "base64" }).send();
if (existing.value) {
  console.log("snapshot already exists:", snapshot);
  process.exit(0);
}

const signature = await sendInstructions(payer, [
  getInitSnapshotInstruction(
    { payer, agent, mint: DEMO_USDC_MINT, snapshot },
    { programAddress: guardProgram },
  ),
]);
console.log("snapshot PDA:", snapshot);
console.log("tx:", explorerTx(signature));
