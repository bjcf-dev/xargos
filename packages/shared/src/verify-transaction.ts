import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
} from "@solana/kit";
import type { BuildResponse } from "./contract";

/** Programs a recipe transaction may call. Anything else means the tx is not what was promised. */
export const RECIPE_PROGRAMS = [
  "11111111111111111111111111111111",
  "ComputeBudget111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
] as const;

// Anchor discriminators of the guard (packages/guard-client/idl/guard.json).
const SNAPSHOT = [144, 236, 6, 133, 233, 160, 21, 94];
const ASSERT_MIN_DELTA = [250, 209, 147, 108, 157, 58, 206, 34];

const startsWith = (data: ArrayLike<number>, prefix: number[]) =>
  prefix.every((b, i) => data[i] === b);

function readU64(data: ArrayLike<number>, offset: number): bigint {
  const bytes = Uint8Array.from(Array.from(data).slice(offset, offset + 8));
  return bytes.length === 8 ? new DataView(bytes.buffer).getBigUint64(0, true) : -1n;
}

export type RecipeCheck = { ok: true } | { ok: false; reason: string };

/**
 * What an agent checks before signing, so it does not have to trust the service: the agent is the
 * only signer, only known programs run, the guard opens and closes the tx over the agent's token
 * account, and the minimum on-chain is the one in the response. It does NOT prove what happens to
 * the agent's other balances: simulate the tx and compare `watchAccounts` for that.
 */
export function verifyRecipeTransaction(
  transaction: string,
  build: Pick<BuildResponse, "guard">,
  agent: string,
): RecipeCheck {
  const fail = (reason: string): RecipeCheck => ({ ok: false, reason });

  let message: ReturnType<ReturnType<typeof getCompiledTransactionMessageDecoder>["decode"]>;
  try {
    const { messageBytes } = getTransactionDecoder().decode(getBase64Encoder().encode(transaction));
    message = getCompiledTransactionMessageDecoder().decode(messageBytes);
  } catch {
    return fail("The transaction cannot be decoded");
  }

  // With a lookup table the accounts are not in the message and could not be checked here.
  if ("addressTableLookups" in message && (message.addressTableLookups?.length ?? 0) > 0) {
    return fail("The transaction uses a lookup table, so its accounts cannot be checked offline");
  }
  if (!("instructions" in message)) return fail("Unsupported transaction version");
  const { staticAccounts: accounts, instructions, header } = message;
  if (header.numSignerAccounts !== 1 || accounts[0] !== agent) {
    return fail("The agent must be the fee payer and the only signer");
  }

  const allowed = new Set<string>([...RECIPE_PROGRAMS, build.guard.programId]);
  for (const ix of instructions) {
    const program = accounts[ix.programAddressIndex];
    if (!program || !allowed.has(program)) return fail(`Unexpected program: ${program}`);
  }

  const { snapshotIndex, assertIndex, watchedAccount, minDelta, programId } = build.guard;
  const watchedAt = (ix: (typeof instructions)[number], position: number) =>
    accounts[ix.accountIndices?.[position] ?? -1] === watchedAccount;

  const snapshot = instructions[snapshotIndex];
  if (
    !snapshot ||
    accounts[snapshot.programAddressIndex] !== programId ||
    !startsWith(snapshot.data ?? [], SNAPSHOT) ||
    !watchedAt(snapshot, 0)
  ) {
    return fail("The guard snapshot is not where the response says");
  }
  for (const ix of instructions.slice(0, snapshotIndex)) {
    if (ix.accountIndices?.some((i: number) => accounts[i] === watchedAccount)) {
      return fail("An instruction touches the watched account before the snapshot");
    }
  }

  const assertion = instructions[assertIndex];
  if (
    !assertion ||
    assertIndex !== instructions.length - 1 ||
    accounts[assertion.programAddressIndex] !== programId ||
    !startsWith(assertion.data ?? [], ASSERT_MIN_DELTA) ||
    !watchedAt(assertion, 0)
  ) {
    return fail("The guard assert is not the last instruction");
  }
  if (readU64(assertion.data ?? [], 8) !== BigInt(minDelta)) {
    return fail("The minimum on-chain differs from the promised one");
  }
  return { ok: true };
}
