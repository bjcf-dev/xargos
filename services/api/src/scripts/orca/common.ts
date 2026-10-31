import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  setDefaultFunder,
  setNativeMintWrappingStrategy,
  setPayerFromBytes,
  setPriorityFeeSetting,
  setRpc,
  WhirlpoolDeployment,
} from "@orca-so/whirlpools";
import { type Address, address, createSolanaRpc } from "@solana/kit";
import { assertDevnet as assertDevnetRpc } from "../../solana/assert-devnet";

// Devnet only (rule 1). Public RPC unless RPC_URL is set; never print the URL (it may carry a key).
export const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
export const DEPLOYMENT = WhirlpoolDeployment.devnet;

export const WSOL_MINT: Address = address("So11111111111111111111111111111111111111112");
// Circle devnet USDC (ADR 0001).
export const USDC_MINT: Address = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
// Plan B of D11: our own "demo USDC" mint, created by create-demo-mint.ts (mint authority: facilitator).
export const DEMO_USDC_MINT: Address = address(
  process.env.DEMO_USDC_MINT || "D1PzuAbRJB1io3awJX2GDoiL1ihwK9Kt9yfciLrgJFss",
);
export const USDC_DECIMALS = 6;
export const TICK_SPACING = 64;

export const rpc = createSolanaRpc(RPC_URL);

export const explorerTx = (signature: string) =>
  `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

export { DEVNET_GENESIS_HASH } from "../../solana/assert-devnet";

/** The scripts check their own RPC before loading a key. */
export const assertDevnet = (client: Parameters<typeof assertDevnetRpc>[0] = rpc) =>
  assertDevnetRpc(client);

/** Reads ~/.config/xargos/<name>-keypair.json. The bytes never leave this process or get printed. */
export function loadKeyBytes(name: string): Uint8Array<ArrayBuffer> {
  const file = join(homedir(), ".config", "xargos", `${name}-keypair.json`);
  return Uint8Array.from(JSON.parse(readFileSync(file, "utf8")));
}

/** Points the Orca SDK actions at devnet with the facilitator as payer (decision of 28 Oct). */
export async function useFacilitator() {
  await assertDevnet();
  await setRpc(RPC_URL);
  setNativeMintWrappingStrategy("ata");
  setPriorityFeeSetting({ type: "none" });
  const payer = await setPayerFromBytes(loadKeyBytes("facilitator"));
  setDefaultFunder(payer);
  return payer;
}
