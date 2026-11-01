use anchor_lang::prelude::*;

pub const SNAPSHOT_SEED: &[u8] = b"snap";

/// Balance of the agent's token account at the start of the transaction.
/// PDA: ["snap", agent, mint]. Created once by the backend (D8).
#[account]
#[derive(InitSpace)]
pub struct Snapshot {
    pub agent: Pubkey,
    pub mint: Pubkey,
    /// Token account balance when `snapshot` last ran.
    pub amount: u64,
    /// Slot of that run: `assert_min_delta` only accepts the same slot (D7).
    pub slot: u64,
    pub bump: u8,
}
