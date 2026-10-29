use anchor_lang::prelude::*;

#[error_code]
pub enum GuardError {
    #[msg("Token account owner is not the snapshot agent")]
    InvalidOwner,
    #[msg("Token account mint is not the snapshot mint")]
    InvalidMint,
    #[msg("Snapshot was taken in a different slot")]
    StaleSnapshot,
    #[msg("min_delta must be greater than zero")]
    InvalidMinDelta,
    #[msg("Received amount is below min_delta")]
    MinDeltaNotMet,
    #[msg("Token account is not the associated token account of the snapshot agent and mint")]
    NotAssociatedTokenAccount,
}
