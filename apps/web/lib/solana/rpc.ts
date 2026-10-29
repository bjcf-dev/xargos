import { createSolanaRpc } from "@solana/kit";
import type { SendRpc } from "./send";

/** El RPC del navegador: siempre /api/xargos/rpc, que solo habla con devnet (D30). */
export function browserRpc(): SendRpc {
  return createSolanaRpc(new URL("/api/xargos/rpc", window.location.origin).href);
}
