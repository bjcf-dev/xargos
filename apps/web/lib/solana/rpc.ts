import { createSolanaRpc, type Rpc, type SolanaRpcApi } from "@solana/kit";

/** La URL del RPC del navegador: siempre /api/xargos/rpc, que solo habla con devnet (D30). */
export function browserRpcUrl(): string {
  return new URL("/api/xargos/rpc", window.location.origin).href;
}

/** El RPC del navegador (browserRpcUrl). */
export function browserRpc(): Rpc<SolanaRpcApi> {
  return createSolanaRpc(browserRpcUrl());
}
