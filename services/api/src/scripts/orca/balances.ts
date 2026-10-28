// Prints the facilitator's public address and its SOL / USDC balances. Run:
//   pnpm --filter @xargos/api orca:balances
import { getAssociatedTokenAddress } from "./ata";
import { rpc, USDC_DECIMALS, USDC_MINT, useFacilitator } from "./common";

const payer = await useFacilitator();
const sol = await rpc.getBalance(payer.address).send();
const ata = await getAssociatedTokenAddress(payer.address, USDC_MINT);
const usdc = await rpc
  .getTokenAccountBalance(ata)
  .send()
  .catch(() => null);

console.log("facilitator:", payer.address);
console.log("SOL:", Number(sol.value) / 1e9);
console.log(
  "USDC:",
  usdc ? Number(usdc.value.amount) / 10 ** USDC_DECIMALS : "no token account yet",
);
