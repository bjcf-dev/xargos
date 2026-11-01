import { createSolanaRpc, type Rpc, type SolanaRpcApi } from "@solana/kit";

/** El RPC del navegador: siempre /api/xargos/rpc, que solo habla con devnet (D30). */
export function browserRpc(): Rpc<SolanaRpcApi> {
  return createSolanaRpc(new URL("/api/xargos/rpc", window.location.origin).href);
}
