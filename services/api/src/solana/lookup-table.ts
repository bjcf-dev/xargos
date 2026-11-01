import type { Address, Rpc, SolanaRpcApi } from "@solana/kit";
import { fetchAddressLookupTable } from "@solana-program/address-lookup-table";

export type LookupTables = Record<Address, Address[]>;

/** Loads the addresses stored in an on-chain lookup table, in the shape Kit's compressor expects. */
export async function loadLookupTable(
  rpc: Rpc<SolanaRpcApi>,
  tableAddress: Address,
): Promise<LookupTables> {
  const table = await fetchAddressLookupTable(rpc, tableAddress);
  return { [tableAddress]: table.data.addresses };
}
