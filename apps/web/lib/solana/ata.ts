import { type Address, address, getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";

export const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM = address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const WSOL_MINT = address("So11111111111111111111111111111111111111112");
const ASSOCIATED_TOKEN_PROGRAM = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/** La cuenta de token asociada (ATA): semillas dueño, programa de token y mint. */
export async function associatedTokenAddress(
  owner: string,
  mint: string,
  tokenProgram: Address,
): Promise<Address> {
  const encoder = getAddressEncoder();
  const [pda] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM,
    seeds: [
      encoder.encode(address(owner)),
      encoder.encode(tokenProgram),
      encoder.encode(address(mint)),
    ],
  });
  return pda;
}
