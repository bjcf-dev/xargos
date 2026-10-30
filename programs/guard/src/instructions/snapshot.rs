use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::TokenAccount;

use crate::error::GuardError;
use crate::state::{Snapshot, SNAPSHOT_SEED};

#[derive(Accounts)]
pub struct TakeSnapshot<'info> {
    #[account(
        constraint = agent_token_account.owner == snapshot.agent @ GuardError::InvalidOwner,
        constraint = agent_token_account.mint == snapshot.mint @ GuardError::InvalidMint,
        // Snapshot and assert must read the same account: a second token account of the agent would do.
        constraint = agent_token_account.key()
            == get_associated_token_address(&snapshot.agent, &snapshot.mint)
            @ GuardError::NotAssociatedTokenAccount,
    )]
    pub agent_token_account: Account<'info, TokenAccount>,
    /// Seeds come from the stored agent and mint, not from whoever calls (lesson 1).
    #[account(
        mut,
        seeds = [SNAPSHOT_SEED, snapshot.agent.as_ref(), snapshot.mint.as_ref()],
        bump = snapshot.bump,
    )]
    pub snapshot: Account<'info, Snapshot>,
}

pub fn handle_snapshot(ctx: Context<TakeSnapshot>) -> Result<()> {
    let snapshot = &mut ctx.accounts.snapshot;
    snapshot.amount = ctx.accounts.agent_token_account.amount;
    snapshot.slot = Clock::get()?.slot;
    Ok(())
}
