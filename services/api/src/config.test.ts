import { describe, expect, it } from "vitest";
import { parseConfig } from "./config";

const valid = {
  SOLANA_CLUSTER: "devnet",
  RPC_URL: "https://devnet.helius-rpc.com/?api-key=SECRET",
  PAYER_KEYPAIR_PATH: "/keys/payer.json",
  USDC_MINT: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  DEMO_USDC_MINT: "D1PzuAbRJB1io3awJX2GDoiL1ihwK9Kt9yfciLrgJFss",
  GUARD_PROGRAM_ID: "97YMLtF9e6tW3e2ynHASe4qCB2e8uGnyGh5AmJNkJmCm",
  WHIRLPOOL_ADDRESS: "3qTZVVZbPmCGE3h3GpGxNw6B3F6Z2NdYJeWiv4Kw38pS",
  PAY_TO_ADDRESS: "3NxLt5rLgsT46ngFjUj2VQhsfhu1miEmARUTS8gN1MYw",
};

describe("parseConfig", () => {
  it("accepts a complete devnet config and fills the defaults", () => {
    const config = parseConfig(valid);
    expect(config.PORT).toBe(8787);
    expect(config.FUND_SOL_LAMPORTS).toBe(20_000_000n);
    expect(config.DEMO_ACCESS_CODE).toBeUndefined();
  });

  it("needs the payer key from a path or from PAYER_KEYPAIR", () => {
    expect(() => parseConfig({ ...valid, PAYER_KEYPAIR_PATH: undefined })).toThrow(
      /PAYER_KEYPAIR_PATH/,
    );
    expect(
      parseConfig({ ...valid, PAYER_KEYPAIR_PATH: undefined, PAYER_KEYPAIR: "[1]" }),
    ).toBeTruthy();
  });

  it("refuses any cluster that is not devnet", () => {
    expect(() => parseConfig({ ...valid, SOLANA_CLUSTER: "mainnet-beta" })).toThrow(
      /SOLANA_CLUSTER/,
    );
  });

  it("names the missing variables", () => {
    expect(() => parseConfig({ ...valid, GUARD_PROGRAM_ID: undefined })).toThrow(
      /GUARD_PROGRAM_ID/,
    );
  });

  it("never puts a value in the error message", () => {
    try {
      parseConfig({ ...valid, RPC_URL: "not a url with SECRET-TOKEN" });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toContain("RPC_URL");
      expect(String(error)).not.toContain("SECRET-TOKEN");
    }
  });

  it("rejects a malformed address", () => {
    expect(() => parseConfig({ ...valid, WHIRLPOOL_ADDRESS: "xyz" })).toThrow(/WHIRLPOOL_ADDRESS/);
  });
});
