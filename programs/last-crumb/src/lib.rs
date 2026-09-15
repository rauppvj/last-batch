pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("BioGs7AczUWcMYMz83sExMs3mtQHtfJqytmrymtLwM5c");

/// Last Crumb: every bake pays into a shared pot and restarts the timer.
/// When the timer runs out, the last baker takes the pot.
#[program]
pub mod last_crumb {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        bake_price: u64,
        round_secs: i64,
        jar_bps: u16,
        carry_bps: u16,
    ) -> Result<()> {
        crate::instructions::initialize::handle_initialize(ctx, bake_price, round_secs, jar_bps, carry_bps)
    }

    pub fn bake(ctx: Context<Bake>) -> Result<()> {
        crate::instructions::bake::handle_bake(ctx)
    }

    pub fn sweeten(ctx: Context<Sweeten>, amount: u64) -> Result<()> {
        crate::instructions::sweeten::handle_sweeten(ctx, amount)
    }

    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        crate::instructions::settle::handle_settle(ctx)
    }
}
