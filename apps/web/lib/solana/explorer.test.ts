import { describe, expect, it } from "vitest";
import { ellipsify, getExplorerUrl } from "./explorer";

describe("getExplorerUrl", () => {
  it("always points to devnet", () => {
    expect(getExplorerUrl("/tx/abc")).toBe("https://explorer.solana.com/tx/abc?cluster=devnet");
  });

  it("keeps existing query params and forces devnet", () => {
    expect(getExplorerUrl("/address/xyz?cluster=mainnet-beta")).toBe(
      "https://explorer.solana.com/address/xyz?cluster=devnet",
    );
  });
});

describe("ellipsify", () => {
  it("shortens long strings", () => {
    expect(ellipsify("AgentDemo1111111111111111111111111111111111")).toBe("Agen...1111");
  });

  it("leaves short strings untouched", () => {
    expect(ellipsify("short")).toBe("short");
  });
});
