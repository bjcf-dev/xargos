// Creates the address lookup table the exit recipe needs to fit in 1232 bytes (B6). Run:
//   pnpm --filter @xargos/api orca:create-lookup-table
// Stores the accounts every agent shares (read-only accounts, the pool and its vaults).
// Put the printed address in LOOKUP_TABLE_ADDRESS. Wait a slot before building with it.

import { fetchConcentratedLiquidityPool, orderMints } from "@orca-so/whirlpools";
import { AccountRole, address } from "@solana/kit";
import {
  findAddressLookupTablePda,
  getCreateLookupTableInstruction,
  getExtendLookupTableInstruction,
} from "@solana-program/address-lookup-table";
import { createExitOrcaLpRecipe } from "../../recipes/exit-orca-lp";
import {
  DEMO_USDC_MINT,
  DEPLOYMENT,
  explorerTx,
  rpc,
  TICK_SPACING,
  USDC_MINT,
  useFacilitator,
  WSOL_MINT,
} from "./common";
import { sendInstructions } from "./send";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`set ${name} (see .env.example)`);
  return value;
};

const payer = await useFacilitator();
const whirlpool = address(required("WHIRLPOOL_ADDRESS"));
const recipe = createExitOrcaLpRecipe({
  rpc,
  whirlpool,
  usdcMint: DEMO_USDC_MINT,
  guardProgram: address(required("GUARD_PROGRAM_ID")),
  priceAmount: "10000",
  priceMint: USDC_MINT,
});
const built = await recipe.build({
  agent: payer.address,
  position: address(required("TEST_POSITION")),
});

const [mintA, mintB] = orderMints(WSOL_MINT, DEMO_USDC_MINT);
const pool = await fetchConcentratedLiquidityPool(rpc, mintA, mintB, TICK_SPACING, DEPLOYMENT);
if (!pool.initialized) throw new Error("pool not initialized");

// Programs invoked by an instruction must stay in the message, so they are left out.
const programs = new Set(built.steps.map((s) => s.instruction.programAddress));
const shared = new Set<string>([whirlpool, pool.tokenVaultA, pool.tokenVaultB]);
for (const { instruction } of built.steps) {
  for (const account of instruction.accounts ?? []) {
    if (account.role === AccountRole.READONLY && !programs.has(account.address))
      shared.add(account.address);
  }
}
shared.delete(payer.address);

const recentSlot = (await rpc.getSlot({ commitment: "confirmed" }).send()) - 1n;
const [table, bump] = await findAddressLookupTablePda({ authority: payer.address, recentSlot });
const signature = await sendInstructions(payer, [
  getCreateLookupTableInstruction({
    address: [table, bump],
    authority: payer.address,
    payer,
    recentSlot,
    bump,
  }),
  getExtendLookupTableInstruction({
    address: table,
    authority: payer,
    payer,
    addresses: [...shared].map(address),
  }),
]);
console.log("lookup table:", table, `(${shared.size} addresses)`);
console.log("tx:", explorerTx(signature));
