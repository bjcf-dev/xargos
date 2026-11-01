import type { Address, Rpc, SolanaRpcApi } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

export type PayerBalances = { sol: string; usdc: string };

export type PayerFunds = {
  /** Cached balances, or null when the RPC does not answer. */
  read(): Promise<PayerBalances | null>;
  /** False only when the payer is known to be short: an RPC hiccup must not close the demo. */
  enough(): Promise<boolean>;
};

const CACHE_MS = 30_000;

/** What the payer has left. Cached, because /health is public and each read costs RPC quota. */
export function createPayerFunds(d: {
  rpc: Rpc<SolanaRpcApi>;
  payer: Address;
  circleUsdc: Address;
  minLamports: bigint;
  now?: () => number;
}): PayerFunds {
  const now = d.now ?? Date.now;
  let cached: { at: number; value: PayerBalances | null } | undefined;

  async function fetchBalances(): Promise<PayerBalances | null> {
    try {
      const [ata] = await findAssociatedTokenPda({
        owner: d.payer,
        mint: d.circleUsdc,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
      const [sol, usdc] = await Promise.all([
        d.rpc.getBalance(d.payer).send(),
        d.rpc
          .getTokenAccountBalance(ata)
          .send()
          .catch(() => null),
      ]);
      return { sol: sol.value.toString(), usdc: usdc?.value.amount ?? "0" };
    } catch {
      return null;
    }
  }

  const read = async () => {
    if (!cached || now() - cached.at >= CACHE_MS) {
      cached = { at: now(), value: await fetchBalances() };
    }
    return cached.value;
  };

  return {
    read,
    async enough() {
      const balances = await read();
      return balances === null || BigInt(balances.sol) >= d.minLamports;
    },
  };
}
