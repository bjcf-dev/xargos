/** Genesis hash of Solana devnet. The RPC must answer with it before any key is loaded (rule 1). */
export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

type GenesisClient = { getGenesisHash(): { send(): Promise<string> } };

/** Stops when the RPC is not devnet, so a wrong RPC_URL can never move funds on another network. */
export async function assertDevnet(client: GenesisClient): Promise<void> {
  const genesis = await client.getGenesisHash().send();
  if (genesis !== DEVNET_GENESIS_HASH) {
    throw new Error("RPC_URL does not point to devnet (genesis hash differs): stopping");
  }
}
