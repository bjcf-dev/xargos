import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  type Rpc,
  type SolanaRpcApi,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { BuildResponse } from "@xargos/shared";
import type { BuildContext, Recipe } from "../recipes/types";

/** Largest serialized transaction Solana accepts (lesson 16). */
export const MAX_TRANSACTION_BYTES = 1232;
/** The blockhash lives ~60 s; the free rebuild window is 120 s (D19, lesson 14). */
export const EXPIRES_IN_MS = 60_000;
export const REBUILD_WINDOW_MS = 120_000;

export type BuildParams = {
  recipe: Recipe;
  context: BuildContext;
  buildId: string;
  rpc: Rpc<SolanaRpcApi>;
  now?: Date;
};

/** Builds the unsigned v0 transaction for a recipe and validates the whole response against the contract. */
export async function buildResponse({
  recipe,
  context,
  buildId,
  rpc,
  now = new Date(),
}: BuildParams) {
  const built = await recipe.build(context);
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(context.agent, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) =>
      appendTransactionMessageInstructions(
        built.steps.map((s) => s.instruction),
        m,
      ),
  );
  const transaction = getBase64EncodedWireTransaction(compileTransaction(message));

  const size = Buffer.from(transaction, "base64").length;
  if (size > MAX_TRANSACTION_BYTES) {
    throw new Error(
      `Transaction is ${size} bytes (max ${MAX_TRANSACTION_BYTES}): it needs an address lookup table`,
    );
  }

  const kinds = built.steps.map((s) => s.kind);
  return BuildResponse.parse({
    buildId,
    recipeId: recipe.info.id,
    transaction,
    expiresAt: new Date(now.getTime() + EXPIRES_IN_MS).toISOString(),
    rebuildUntil: new Date(now.getTime() + REBUILD_WINDOW_MS).toISOString(),
    quote: built.quote,
    guard: {
      ...built.guard,
      snapshotIndex: kinds.indexOf("guard"),
      assertIndex: kinds.lastIndexOf("guard"),
    },
    steps: built.steps.map((s, index) => ({
      index,
      label: s.label,
      protocol: s.protocol,
      programId: s.instruction.programAddress,
      kind: s.kind,
    })),
    watchAccounts: [built.guard.watchedAccount],
  });
}
