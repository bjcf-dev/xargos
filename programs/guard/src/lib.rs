pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;

declare_id!("97YMLtF9e6tW3e2ynHASe4qCB2e8uGnyGh5AmJNkJmCm");

#[program]
pub mod guard {
    use super::*;

    pub fn init_snapshot(ctx: Context<InitSnapshot>) -> Result<()> {
        instructions::init_snapshot::handle_init_snapshot(ctx)
    }

    pub fn snapshot(ctx: Context<TakeSnapshot>) -> Result<()> {
        instructions::snapshot::handle_snapshot(ctx)
    }

    pub fn assert_min_delta(ctx: Context<AssertMinDelta>, min_delta: u64) -> Result<()> {
        instructions::assert_min_delta::handle_assert_min_delta(ctx, min_delta)
    }
}
