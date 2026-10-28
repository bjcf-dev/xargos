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
        instructions::init_snapshot::handler(ctx)
    }
}
