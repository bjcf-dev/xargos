// @vitest-environment node
import { describe, expect, it } from "vitest";
import { associatedTokenAddress, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, WSOL_MINT } from "./ata";

const AGENT = "AgentDemo1111111111111111111111111111111111";

// Valores de referencia de findAssociatedTokenPda (@solana-program/token, el de services/api).
describe("associatedTokenAddress", () => {
  it("derives the agent's wSOL account (classic token program)", async () => {
    expect(await associatedTokenAddress(AGENT, WSOL_MINT, TOKEN_PROGRAM)).toBe(
      "HmJS62S4Tt5iXffu4CZ2bNUNNXtFy6URjkRbBEUyAYra",
    );
  });

  it("derives a position NFT account (Token-2022)", async () => {
    expect(
      await associatedTokenAddress(
        AGENT,
        "PositionDemo1111111111111111111111111111111",
        TOKEN_2022_PROGRAM,
      ),
    ).toBe("FHqPxYZ11kASYCV7LnXvD6RzAnGELDVBUmKudagEzGW3");
  });
});
