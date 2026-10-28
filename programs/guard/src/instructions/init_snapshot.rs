use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::state::{Snapshot, SNAPSHOT_SEED};

#[derive(Accounts)]
pub struct InitSnapshot<'info> {
    /// Pays the rent. The backend signs, the agent does not need to (D8).
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: only used as a PDA seed and stored; it never signs here.
    pub agent: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = payer,
        space = 8 + Snapshot::INIT_SPACE,
        seeds = [SNAPSHOT_SEED, agent.key().as_ref(), mint.key().as_ref()],
        bump,
    )]
    pub snapshot: Account<'info, Snapshot>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitSnapshot>) -> Result<()> {
    let snapshot = &mut ctx.accounts.snapshot;
    snapshot.agent = ctx.accounts.agent.key();
    snapshot.mint = ctx.accounts.mint.key();
    snapshot.amount = 0;
    snapshot.slot = 0;
    snapshot.bump = ctx.bumps.snapshot;
    Ok(())
}
