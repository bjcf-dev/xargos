import { createRpcProxy, DEVNET_PUBLIC_RPC } from "@/lib/server/rpc-proxy";

// SOLANA_RPC_URL solo existe en el servidor (puede llevar una api-key): nunca NEXT_PUBLIC_*.
const proxy = createRpcProxy({ upstreamUrl: process.env.SOLANA_RPC_URL || DEVNET_PUBLIC_RPC });

export function POST(request: Request): Promise<Response> {
  return proxy(request);
}
