import { describe, expect, it } from "vitest";
import { assertDevnet, DEVNET_GENESIS_HASH } from "./assert-devnet";

const answering = (hash: string) => ({ getGenesisHash: () => ({ send: async () => hash }) });

describe("assertDevnet", () => {
  it("lets devnet through", async () => {
    await expect(assertDevnet(answering(DEVNET_GENESIS_HASH))).resolves.toBeUndefined();
  });

  it("stops on mainnet's genesis hash", async () => {
    const mainnet = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
    await expect(assertDevnet(answering(mainnet))).rejects.toThrow(/does not point to devnet/);
  });

  it("does not leak the answer in the error", async () => {
    await expect(assertDevnet(answering("secret-looking-value"))).rejects.not.toThrow(
      /secret-looking-value/,
    );
  });
});
