// Opens a test position in the demo pool (B4). The SDK also initializes the tick arrays that
// the price range needs (lesson 18). Run: pnpm --filter @xargos/api orca:open-position
import { openConcentratedPosition } from "@orca-so/whirlpools";
import { address } from "@solana/kit";
import { DEPLOYMENT, explorerTx, useFacilitator } from "./common";

const POOL = process.env.WHIRLPOOL_ADDRESS;
if (!POOL) throw new Error("set WHIRLPOOL_ADDRESS (see .env.example)");

// Wide on purpose: the price shock of demo B must stay inside liquidity and initialized arrays.
const LOWER_PRICE = 100;
const UPPER_PRICE = 250;
// Upper bounds on what the position may take; the SDK deposits the max liquidity that fits both.
// POSITION_SOL (lamports) sizes the position; demo USDC is capped at 300 per SOL.
const MAX_SOL = BigInt(process.env.POSITION_SOL ?? 1_000_000_000);
const MAX_DEMO_USDC = (MAX_SOL * 300_000_000n) / 1_000_000_000n;

await useFacilitator();
const { positionMint, initializationCost, callback } = await openConcentratedPosition(
  address(POOL),
  { tokenMaxA: MAX_SOL, tokenMaxB: MAX_DEMO_USDC },
  LOWER_PRICE,
  UPPER_PRICE,
  { whirlpoolDeployment: DEPLOYMENT },
);
console.log("opening position", positionMint, "init cost (lamports)", initializationCost);
const signature = await callback();
console.log("position NFT mint:", positionMint);
console.log("tx:", explorerTx(signature));
