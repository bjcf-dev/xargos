// Creates the SOL/demo-USDC concentrated-liquidity pool on Orca devnet (B4, plan B of D11). Run:
//   pnpm --filter @xargos/api orca:create-pool
// Prints the pool address and the transaction link. Put the address in WHIRLPOOL_ADDRESS.
import {
  createConcentratedLiquidityPool,
  fetchConcentratedLiquidityPool,
  orderMints,
} from "@orca-so/whirlpools";
import {
  DEMO_USDC_MINT,
  DEPLOYMENT,
  explorerTx,
  rpc,
  TICK_SPACING,
  useFacilitator,
  WSOL_MINT,
} from "./common";

// Price of 1 SOL in USDC at pool creation. A demo value, not a market price.
const INITIAL_PRICE = Number(process.env.INITIAL_PRICE ?? 150);

await useFacilitator();
const [mintA, mintB] = orderMints(WSOL_MINT, DEMO_USDC_MINT);
if (mintA !== WSOL_MINT) throw new Error("expected wSOL as token A: the initial price assumes it");

const existing = await fetchConcentratedLiquidityPool(rpc, mintA, mintB, TICK_SPACING, DEPLOYMENT);
if (existing.initialized) {
  console.log("pool already exists:", existing.address, "price", existing.price);
  process.exit(0);
}

const { poolAddress, initializationCost, callback } = await createConcentratedLiquidityPool(
  mintA,
  mintB,
  TICK_SPACING,
  { initialPrice: INITIAL_PRICE, whirlpoolDeployment: DEPLOYMENT },
);
console.log("creating pool", poolAddress, "cost (lamports)", initializationCost);
const signature = await callback();
console.log("pool:", poolAddress);
console.log("tx:", explorerTx(signature));
