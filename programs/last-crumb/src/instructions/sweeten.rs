use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    instructions::bake::pay,
    state::{Oven, Sweetened},
};

/// Adds COOK to the pot without taking the last-baker spot or touching the timer.
#[derive(Accounts)]
pub struct Sweeten<'info> {
    #[account(mut)]
    pub donor: Signer<'info>,
    #[account(mut, seeds = [OVEN_SEED], bump = oven.bump)]
    pub oven: Account<'info, Oven>,
    pub system_program: Program<'info, System>,
}

pub fn handle_sweeten(ctx: Context<Sweeten>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::ZeroAmount);
    pay(
        &ctx.accounts.donor,
        ctx.accounts.oven.to_account_info(),
        amount,
    )?;

    let oven = &mut ctx.accounts.oven;
    oven.pot = oven.pot.checked_add(amount).ok_or(ErrorCode::Overflow)?;

    emit!(Sweetened {
        round: oven.round,
        donor: ctx.accounts.donor.key(),
        amount,
        pot: oven.pot,
    });
    Ok(())
}
