// Prints the facilitator's public address and its SOL, Circle USDC and demo USDC balances. Run:
//   pnpm --filter @xargos/api orca:balances
import { getAssociatedTokenAddress } from "./ata";
import { DEMO_USDC_MINT, rpc, USDC_DECIMALS, USDC_MINT, useFacilitator } from "./common";

const payer = await useFacilitator();
const sol = await rpc.getBalance(payer.address).send();

async function tokenBalance(mint: typeof USDC_MINT): Promise<string> {
  const ata = await getAssociatedTokenAddress(payer.address, mint);
  const balance = await rpc
    .getTokenAccountBalance(ata)
    .send()
    .catch(() => null);
  return balance
    ? String(Number(balance.value.amount) / 10 ** USDC_DECIMALS)
    : "no token account yet";
}

console.log("facilitator:", payer.address);
console.log("SOL:", Number(sol.value) / 1e9);
console.log("USDC (Circle, x402 payments):", await tokenBalance(USDC_MINT));
console.log("demo USDC (pool):", await tokenBalance(DEMO_USDC_MINT));
