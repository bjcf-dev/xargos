// Test swap in the demo pool (B4): sells a little SOL for demo USDC. Run:
//   pnpm --filter @xargos/api orca:swap
import { swap } from "@orca-so/whirlpools";
import { address } from "@solana/kit";
import { DEPLOYMENT, explorerTx, useFacilitator, WSOL_MINT } from "./common";

const POOL = process.env.WHIRLPOOL_ADDRESS;
if (!POOL) throw new Error("set WHIRLPOOL_ADDRESS (see .env.example)");

const INPUT_LAMPORTS = 10_000_000n; // 0.01 SOL

await useFacilitator();
const { quote, callback } = await swap(
  { inputAmount: INPUT_LAMPORTS, mint: WSOL_MINT },
  address(POOL),
  { slippageToleranceBps: 100, whirlpoolDeployment: DEPLOYMENT },
);
console.log("quote: in", quote.tokenIn, "out", quote.tokenEstOut, "min out", quote.tokenMinOut);
const signature = await callback();
console.log("tx:", explorerTx(signature));
