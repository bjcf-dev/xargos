import { address, type Rpc, type SolanaRpcApi } from "@solana/kit";
import { describe, expect, it, vi } from "vitest";
import { createPayerFunds } from "./funds";

const PAYER = address("3qybJ9ApEBWun7xvbnrVJ6NfDpvRGTBbppfxaFENe6SC");
const USDC = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

function funds(lamports: bigint | null, now = () => 0) {
  const getBalance = vi.fn(() => ({
    send: async () => {
      if (lamports === null) throw new Error("rpc down");
      return { value: lamports };
    },
  }));
  const rpc = {
    getBalance,
    getTokenAccountBalance: () => ({ send: async () => ({ value: { amount: "18350000" } }) }),
  } as unknown as Rpc<SolanaRpcApi>;
  return {
    getBalance,
    funds: createPayerFunds({ rpc, payer: PAYER, circleUsdc: USDC, minLamports: 100n, now }),
  };
}

describe("createPayerFunds", () => {
  it("reads SOL and USDC as strings of base units", async () => {
    expect(await funds(500n).funds.read()).toEqual({ sol: "500", usdc: "18350000" });
  });

  it("says when the payer is short", async () => {
    expect(await funds(99n).funds.enough()).toBe(false);
    expect(await funds(100n).funds.enough()).toBe(true);
  });

  it("does not close the demo because the RPC failed", async () => {
    const { funds: down } = funds(null);
    expect(await down.read()).toBeNull();
    expect(await down.enough()).toBe(true);
  });

  it("caches the balance, so a public /health cannot burn the RPC quota", async () => {
    let clock = 0;
    const { funds: cached, getBalance } = funds(500n, () => clock);
    await cached.read();
    clock = 29_999;
    await cached.read();
    expect(getBalance).toHaveBeenCalledOnce();
    clock = 30_000;
    await cached.read();
    expect(getBalance).toHaveBeenCalledTimes(2);
  });
});
