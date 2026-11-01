// One-off: create the USDC token account of `payto` (paid by the facilitator key). Idempotent.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  address,
  appendTransactionMessageInstruction,
  assertIsTransactionWithBlockhashLifetime,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { USDC_DEVNET_ADDRESS } from "@x402/svm";

const load = (name: string) =>
  createKeyPairSignerFromBytes(
    Uint8Array.from(
      JSON.parse(
        readFileSync(join(homedir(), ".config", "xargos", `${name}-keypair.json`), "utf8"),
      ),
    ),
  );
const [facilitator, payto] = await Promise.all([load("facilitator"), load("payto")]);
const mint = address(USDC_DEVNET_ADDRESS);

const rpc = createSolanaRpc("https://api.devnet.solana.com");
const rpcSubscriptions = createSolanaRpcSubscriptions("wss://api.devnet.solana.com");
const [ata] = await findAssociatedTokenPda({
  owner: payto.address,
  mint,
  tokenProgram: TOKEN_PROGRAM_ADDRESS,
});
const { value: blockhash } = await rpc.getLatestBlockhash().send();

const message = pipe(
  createTransactionMessage({ version: 0 }),
  (m) => setTransactionMessageFeePayerSigner(facilitator, m),
  (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
  (m) =>
    appendTransactionMessageInstruction(
      getCreateAssociatedTokenIdempotentInstruction({
        payer: facilitator,
        ata,
        owner: payto.address,
        mint,
      }),
      m,
    ),
);
const signed = await signTransactionMessageWithSigners(message);
assertIsTransactionWithBlockhashLifetime(signed);
await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signed, {
  commitment: "confirmed",
});
console.log("payto ATA:", ata);
console.log(
  `explorer: https://explorer.solana.com/tx/${getSignatureFromTransaction(signed)}?cluster=devnet`,
);
