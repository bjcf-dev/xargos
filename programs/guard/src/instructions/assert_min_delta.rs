use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::error::GuardError;
use crate::state::{Snapshot, SNAPSHOT_SEED};

#[derive(Accounts)]
pub struct AssertMinDelta<'info> {
    #[account(
        constraint = agent_token_account.owner == snapshot.agent @ GuardError::InvalidOwner,
        constraint = agent_token_account.mint == snapshot.mint @ GuardError::InvalidMint,
    )]
    pub agent_token_account: Account<'info, TokenAccount>,
    #[account(
        seeds = [SNAPSHOT_SEED, snapshot.agent.as_ref(), snapshot.mint.as_ref()],
        bump = snapshot.bump,
    )]
    pub snapshot: Account<'info, Snapshot>,
}

pub fn handle_assert_min_delta(ctx: Context<AssertMinDelta>, min_delta: u64) -> Result<()> {
    require!(min_delta > 0, GuardError::InvalidMinDelta);

    let snapshot = &ctx.accounts.snapshot;
    require!(
        snapshot.slot == Clock::get()?.slot,
        GuardError::StaleSnapshot
    );

    // A balance that went down counts as nothing received, so the assert fails without a panic.
    let received = ctx
        .accounts
        .agent_token_account
        .amount
        .checked_sub(snapshot.amount)
        .unwrap_or(0);

    if received < min_delta {
        // The UI reads this exact line to tell a guard revert from any other failure (D15).
        msg!("GUARD_FAIL received={} min={}", received, min_delta);
        return err!(GuardError::MinDeltaNotMet);
    }
    Ok(())
}
