import { WhirlpoolDeployment } from "@orca-so/whirlpools";
import {
  getClosePositionWithTokenExtensionsDiscriminatorBytes,
  getCollectFeesV2DiscriminatorBytes,
  getDecreaseLiquidityV2DiscriminatorBytes,
} from "@orca-so/whirlpools-client";
import { type Address, address, type Instruction, type ReadonlyUint8Array } from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { describe, expect, it } from "vitest";
import { closeStepLabel, tagStep } from "./steps";

const action = { label: "Close the LP position", protocol: "Orca Whirlpools" };
const ix = (programAddress: Address, first?: number): Instruction => ({
  programAddress,
  accounts: [],
  ...(first === undefined ? {} : { data: new Uint8Array([first]) }),
});

describe("tagStep", () => {
  it("marks Orca's own instructions as the action", () => {
    expect(tagStep(ix(WhirlpoolDeployment.devnet.programId), action)).toMatchObject({
      kind: "action",
      label: "Close the LP position",
    });
  });

  it("names the closing of the temporary wSOL account, so a failure says what failed", () => {
    expect(tagStep(ix(TOKEN_PROGRAM_ADDRESS, 9), action)).toMatchObject({
      kind: "setup",
      label: "Unwrap SOL (close the temporary account)",
    });
  });

  it("names the wrapping of SOL", () => {
    expect(tagStep(ix(TOKEN_PROGRAM_ADDRESS, 17), action).label).toBe("Wrap SOL");
    expect(tagStep(ix(address("11111111111111111111111111111111")), action).label).toBe("Wrap SOL");
  });

  it("names the creation of a token account", () => {
    const ata = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
    expect(tagStep(ix(ata, 1), action).label).toBe("Create token account");
  });

  it("falls back to a generic setup label for any other plumbing", () => {
    expect(tagStep(ix(TOKEN_PROGRAM_ADDRESS, 3), action)).toMatchObject({
      kind: "setup",
      label: "Prepare token accounts",
    });
  });
});

describe("closeStepLabel", () => {
  const orca = (data: ReadonlyUint8Array) => ({
    programAddress: WhirlpoolDeployment.devnet.programId,
    data,
  });

  it("names each of the three instructions that close a position", () => {
    expect(closeStepLabel(orca(getDecreaseLiquidityV2DiscriminatorBytes()))).toBe(
      "Withdraw the liquidity",
    );
    expect(closeStepLabel(orca(getCollectFeesV2DiscriminatorBytes()))).toBe("Collect the fees");
    expect(closeStepLabel(orca(getClosePositionWithTokenExtensionsDiscriminatorBytes()))).toBe(
      "Close the LP position",
    );
  });
});
