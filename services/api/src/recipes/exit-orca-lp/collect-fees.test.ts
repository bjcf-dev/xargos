import {
  getCollectFeesV2Instruction,
  getDecreaseLiquidityV2Instruction,
  identifyWhirlpoolInstruction,
  WhirlpoolInstruction,
} from "@orca-so/whirlpools-client";
import { address, createNoopSigner, type Instruction } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { withCollectFees } from "./collect-fees";

const addr = (i: number) =>
  address(
    [
      "Vote111111111111111111111111111111111111111",
      "SysvarC1ock11111111111111111111111111111111",
      "SysvarRent111111111111111111111111111111111",
      "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "D1PzuAbRJB1io3awJX2GDoiL1ihwK9Kt9yfciLrgJFss",
      "3qTZVVZbPmCGE3h3GpGxNw6B3F6Z2NdYJeWiv4Kw38pS",
      "97YMLtF9e6tW3e2ynHASe4qCB2e8uGnyGh5AmJNkJmCm",
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    ][i % 8] as string,
  );
const authority = createNoopSigner(addr(0));
const marker = (n: number): Instruction => ({
  programAddress: addr(7),
  accounts: [],
  data: new Uint8Array([n]),
});

const decrease = getDecreaseLiquidityV2Instruction({
  whirlpool: addr(5),
  tokenProgramA: addr(7),
  tokenProgramB: addr(7),
  positionAuthority: authority,
  position: addr(1),
  positionTokenAccount: addr(2),
  tokenMintA: addr(3),
  tokenMintB: addr(4),
  tokenOwnerAccountA: addr(1),
  tokenOwnerAccountB: addr(2),
  tokenVaultA: addr(3),
  tokenVaultB: addr(4),
  tickArrayLower: addr(5),
  tickArrayUpper: addr(6),
  liquidityAmount: 1n,
  tokenMinA: 0n,
  tokenMinB: 0n,
  remainingAccountsInfo: null,
}) as Instruction;

const kind = (ix: Instruction) => identifyWhirlpoolInstruction(ix as never);

describe("withCollectFees", () => {
  it("adds a collect-fees right after the decrease, on the same position", () => {
    const result = withCollectFees([marker(1), decrease, marker(2)], authority);
    expect(result).toHaveLength(4);
    expect(result[1]).toBe(decrease);
    expect(kind(result[2] as Instruction)).toBe(WhirlpoolInstruction.CollectFeesV2);
    expect(result[3]).toEqual(marker(2));
    // the collect points at the position and pool of the decrease
    expect((result[2] as Instruction).accounts?.map((a) => a.address)).toContain(addr(1));
    expect((result[2] as Instruction).accounts?.map((a) => a.address)).toContain(addr(5));
  });

  it("does not add a second collect when the SDK already put one", () => {
    const collect = getCollectFeesV2Instruction({
      whirlpool: addr(5),
      positionAuthority: authority,
      position: addr(1),
      positionTokenAccount: addr(2),
      tokenMintA: addr(3),
      tokenMintB: addr(4),
      tokenOwnerAccountA: addr(1),
      tokenVaultA: addr(3),
      tokenOwnerAccountB: addr(2),
      tokenVaultB: addr(4),
      tokenProgramA: addr(7),
      tokenProgramB: addr(7),
      remainingAccountsInfo: null,
    }) as Instruction;
    const original = [decrease, collect];
    expect(withCollectFees(original, authority)).toBe(original);
  });

  it("fails loudly when the close has no decrease-liquidity", () => {
    expect(() => withCollectFees([marker(1)], authority)).toThrow(/decrease-liquidity/);
  });
});
