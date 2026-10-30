import { type Address, address, getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";
import { describe, expect, it } from "vitest";
import idl from "../idl/guard.json";
import {
  findSnapshotStatePda,
  GUARD_ERROR__NOT_ASSOCIATED_TOKEN_ACCOUNT,
  GUARD_PROGRAM_ADDRESS,
  getAssertMinDeltaInstruction,
  getInitSnapshotInstruction,
  getSnapshotInstruction,
} from "./index";

const AGENT = address("Vote111111111111111111111111111111111111111");
const MINT = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const TOKEN_ACCOUNT = address("SysvarC1ock11111111111111111111111111111111");
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");

const discriminatorOf = (name: string) =>
  Array.from(idl.instructions.find((ix) => ix.name === name)?.discriminator ?? []);

async function snapshotPda(): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: GUARD_PROGRAM_ADDRESS,
    seeds: ["snap", getAddressEncoder().encode(AGENT), getAddressEncoder().encode(MINT)],
  });
  return pda;
}

describe("guard client", () => {
  it("points at the program address in the IDL", () => {
    expect(GUARD_PROGRAM_ADDRESS).toBe(idl.address);
  });

  it("derives the snapshot PDA from agent and mint like the program does", async () => {
    const [pda] = await findSnapshotStatePda({ agent: AGENT, mint: MINT });
    expect(pda).toBe(await snapshotPda());
  });

  it("builds snapshot with the IDL discriminator and the token account first", async () => {
    const snapshot = await snapshotPda();
    const ix = getSnapshotInstruction({ agentTokenAccount: TOKEN_ACCOUNT, snapshot });

    expect(ix.programAddress).toBe(GUARD_PROGRAM_ADDRESS);
    expect(Array.from(ix.data)).toEqual(discriminatorOf("snapshot"));
    expect(ix.accounts.map((a) => a.address)).toEqual([TOKEN_ACCOUNT, snapshot]);
  });

  it("builds assert_min_delta with minDelta as a little-endian u64", async () => {
    const snapshot = await snapshotPda();
    const ix = getAssertMinDeltaInstruction({
      agentTokenAccount: TOKEN_ACCOUNT,
      snapshot,
      minDelta: 9_950_000n,
    });

    const data = Array.from(ix.data);
    expect(data.slice(0, 8)).toEqual(discriminatorOf("assert_min_delta"));
    expect(data).toHaveLength(16);
    expect(new DataView(new Uint8Array(data.slice(8)).buffer).getBigUint64(0, true)).toBe(
      9_950_000n,
    );
    expect(ix.accounts.map((a) => a.address)).toEqual([TOKEN_ACCOUNT, snapshot]);
  });

  it("builds init_snapshot for the backend to sign as payer", async () => {
    const snapshot = await snapshotPda();
    const ix = getInitSnapshotInstruction({
      payer: { address: TOKEN_ACCOUNT, signTransactions: async () => [] } as never,
      agent: AGENT,
      mint: MINT,
      snapshot,
    });

    expect(Array.from(ix.data)).toEqual(discriminatorOf("init_snapshot"));
    expect(ix.accounts.map((a) => a.address)).toContain(SYSTEM_PROGRAM);
  });

  it("exposes the error codes of the program, in IDL order", () => {
    const codes = idl.errors.map((e) => e.code);
    expect(codes).toEqual([6000, 6001, 6002, 6003, 6004, 6005]);
    expect(GUARD_ERROR__NOT_ASSOCIATED_TOKEN_ACCOUNT).toBe(6005);
  });
});
