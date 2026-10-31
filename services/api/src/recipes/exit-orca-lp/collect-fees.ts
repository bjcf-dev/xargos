import {
  getCollectFeesV2Instruction,
  identifyWhirlpoolInstruction,
  parseDecreaseLiquidityV2Instruction,
  WhirlpoolInstruction,
} from "@orca-so/whirlpools-client";
import type { Instruction, TransactionSigner } from "@solana/kit";

type Whirlpool = Parameters<typeof identifyWhirlpoolInstruction>[0];
const kindOf = (instruction: Instruction) => {
  try {
    return identifyWhirlpoolInstruction(instruction as Whirlpool);
  } catch {
    return null;
  }
};

/**
 * Orca refuses to close a position that still has fees owed. The SDK only adds the collect-fees
 * instruction when fees are owed at BUILD time, but a price shock between build and execution is a
 * swap through the position's range, and that swap earns fees. Without a collect, the close fails
 * with ClosePositionNotEmpty before the guard ever runs, and the demo B would not show the guard.
 *
 * This makes sure a collect-fees instruction always follows the decrease. It costs nothing when
 * there is nothing to collect.
 */
export function withCollectFees(
  instructions: Instruction[],
  authority: TransactionSigner,
): Instruction[] {
  const decreaseAt = instructions.findIndex(
    (ix) => kindOf(ix) === WhirlpoolInstruction.DecreaseLiquidityV2,
  );
  if (decreaseAt === -1) throw new Error("The close has no decrease-liquidity instruction");
  if (instructions.some((ix) => kindOf(ix) === WhirlpoolInstruction.CollectFeesV2)) {
    return instructions; // the SDK already collects: after the decrease, so it takes the new fees too
  }

  const decrease = instructions[decreaseAt] as Instruction;
  const a = parseDecreaseLiquidityV2Instruction(decrease as never).accounts;
  const collect = getCollectFeesV2Instruction({
    whirlpool: a.whirlpool.address,
    positionAuthority: authority,
    position: a.position.address,
    positionTokenAccount: a.positionTokenAccount.address,
    tokenMintA: a.tokenMintA.address,
    tokenMintB: a.tokenMintB.address,
    tokenOwnerAccountA: a.tokenOwnerAccountA.address,
    tokenVaultA: a.tokenVaultA.address,
    tokenOwnerAccountB: a.tokenOwnerAccountB.address,
    tokenVaultB: a.tokenVaultB.address,
    tokenProgramA: a.tokenProgramA.address,
    tokenProgramB: a.tokenProgramB.address,
    remainingAccountsInfo: null,
  });
  return [...instructions.slice(0, decreaseAt + 1), collect, ...instructions.slice(decreaseAt + 1)];
}
