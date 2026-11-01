// Plan B of D11: our own "demo USDC" mint (6 decimals), so the pool price is ours to move.
// Mint authority = facilitator. Prints the mint address; set it as DEMO_USDC_MINT. Run:
//   pnpm --filter @xargos/api orca:create-demo-mint

import { generateKeyPairSigner } from "@solana/kit";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getInitializeMint2Instruction,
  getMintSize,
  getMintToInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { explorerTx, rpc, USDC_DECIMALS, useFacilitator } from "./common";
import { sendInstructions } from "./send";

const INITIAL_SUPPLY = 1_000_000n * 10n ** BigInt(USDC_DECIMALS);

const payer = await useFacilitator();
const mint = await generateKeyPairSigner();
const space = BigInt(getMintSize());
const lamports = await rpc.getMinimumBalanceForRentExemption(space).send();
const [ata] = await findAssociatedTokenPda({
  owner: payer.address,
  mint: mint.address,
  tokenProgram: TOKEN_PROGRAM_ADDRESS,
});

const signature = await sendInstructions(payer, [
  getCreateAccountInstruction({
    payer,
    newAccount: mint,
    lamports,
    space,
    programAddress: TOKEN_PROGRAM_ADDRESS,
  }),
  getInitializeMint2Instruction({
    mint: mint.address,
    decimals: USDC_DECIMALS,
    mintAuthority: payer.address,
  }),
  getCreateAssociatedTokenIdempotentInstruction({
    payer,
    ata,
    owner: payer.address,
    mint: mint.address,
  }),
  getMintToInstruction({
    mint: mint.address,
    token: ata,
    mintAuthority: payer,
    amount: INITIAL_SUPPLY,
  }),
]);
console.log("demo USDC mint:", mint.address);
console.log("facilitator token account:", ata);
console.log("tx:", explorerTx(signature));
