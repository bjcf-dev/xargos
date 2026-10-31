import {
  AccountRole,
  type Address,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  type Instruction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { describe, expect, it } from "vitest";
import { verifyRecipeTransaction } from "./verify-transaction";

const AGENT = address("Vote111111111111111111111111111111111111111");
const WATCHED = address("SysvarC1ock11111111111111111111111111111111");
const SNAPSHOT = address("SysvarRent111111111111111111111111111111111");
const GUARD = address("97YMLtF9e6tW3e2ynHASe4qCB2e8uGnyGh5AmJNkJmCm");
const OTHER = address("D1PzuAbRJB1io3awJX2GDoiL1ihwK9Kt9yfciLrgJFss");
const SYSTEM = address("11111111111111111111111111111111");

const u64 = (n: bigint) => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, n, true);
  return out;
};
const accounts = [
  { address: WATCHED, role: AccountRole.READONLY },
  { address: SNAPSHOT, role: AccountRole.WRITABLE },
];
const snapshot: Instruction = {
  programAddress: GUARD,
  accounts,
  data: new Uint8Array([144, 236, 6, 133, 233, 160, 21, 94]),
};
const assertMin = (min: bigint, program = GUARD): Instruction => ({
  programAddress: program,
  accounts,
  data: new Uint8Array([250, 209, 147, 108, 157, 58, 206, 34, ...u64(min)]),
});
const middle: Instruction = { programAddress: SYSTEM, accounts: [], data: new Uint8Array([2]) };

function tx(instructions: Instruction[], feePayer: Address = AGENT): string {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(feePayer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: "11111111111111111111111111111111" as never, lastValidBlockHeight: 1n },
        m,
      ),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  return getBase64EncodedWireTransaction(compileTransaction(message));
}

const build = (assertIndex = 2, snapshotIndex = 0) => ({
  guard: {
    programId: GUARD,
    mint: OTHER,
    watchedAccount: WATCHED,
    minDelta: "9900000",
    snapshotIndex,
    assertIndex,
  },
});
const good = [snapshot, middle, assertMin(9_900_000n)];

describe("verifyRecipeTransaction", () => {
  it("accepts the transaction the response describes", () => {
    expect(verifyRecipeTransaction(tx(good), build(), AGENT)).toEqual({ ok: true });
  });

  it("rejects a program outside the list (say, one that drains the agent)", () => {
    const evil: Instruction = { programAddress: OTHER, accounts: [] };
    const result = verifyRecipeTransaction(
      tx([snapshot, evil, assertMin(9_900_000n)]),
      build(),
      AGENT,
    );
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/Unexpected program/),
    });
  });

  it("rejects a lower minimum on-chain than the promised one", () => {
    const result = verifyRecipeTransaction(tx([snapshot, middle, assertMin(1n)]), build(), AGENT);
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/minimum/) });
  });

  it("rejects a transaction with no snapshot first", () => {
    const result = verifyRecipeTransaction(
      tx([middle, assertMin(9_900_000n)], AGENT),
      build(1),
      AGENT,
    );
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/snapshot/) });
  });

  it("rejects an instruction that moves the watched account before the snapshot", () => {
    const early: Instruction = { programAddress: SYSTEM, accounts, data: new Uint8Array([2]) };
    const result = verifyRecipeTransaction(
      tx([early, snapshot, assertMin(9_900_000n)]),
      build(2, 1),
      AGENT,
    );
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/before the snapshot/),
    });
  });

  it("rejects an instruction after the assert", () => {
    const result = verifyRecipeTransaction(
      tx([snapshot, assertMin(9_900_000n), middle]),
      build(1),
      AGENT,
    );
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/last instruction/) });
  });

  it("rejects a transaction that someone else pays or co-signs", () => {
    expect(verifyRecipeTransaction(tx(good, OTHER), build(), AGENT).ok).toBe(false);
    const cosigned: Instruction = {
      ...middle,
      accounts: [
        {
          address: OTHER,
          role: AccountRole.READONLY_SIGNER,
          signer: createNoopSigner(OTHER),
        } as never,
      ],
    };
    const result = verifyRecipeTransaction(
      tx([snapshot, cosigned, assertMin(9_900_000n)]),
      build(),
      AGENT,
    );
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/only signer/) });
  });

  it("rejects garbage", () => {
    expect(verifyRecipeTransaction("AAAA", build(), AGENT).ok).toBe(false);
  });
});
