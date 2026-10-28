import type { Address } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

export async function getAssociatedTokenAddress(owner: Address, mint: Address): Promise<Address> {
  const [ata] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  return ata;
}
