use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, state::Oven};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Oven::INIT_SPACE,
        seeds = [OVEN_SEED],
        bump
    )]
    pub oven: Account<'info, Oven>,
    /// CHECK: only its address is stored; it receives lamports in `bake`.
    pub jar: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(
    ctx: Context<Initialize>,
    bake_price: u64,
    round_secs: i64,
    jar_bps: u16,
    carry_bps: u16,
) -> Result<()> {
    require!(bake_price >= MIN_BAKE_PRICE, ErrorCode::BakePriceTooLow);
    require!(
        (MIN_ROUND_SECS..=MAX_ROUND_SECS).contains(&round_secs),
        ErrorCode::RoundSecsOutOfRange
    );
    require!(jar_bps <= MAX_JAR_BPS, ErrorCode::JarBpsTooHigh);
    require!(carry_bps <= MAX_CARRY_BPS, ErrorCode::CarryBpsTooHigh);

    let oven = &mut ctx.accounts.oven;
    oven.authority = ctx.accounts.authority.key();
    oven.jar = ctx.accounts.jar.key();
    oven.bake_price = bake_price;
    oven.round_secs = round_secs;
    oven.jar_bps = jar_bps;
    oven.carry_bps = carry_bps;
    oven.round = 1;
    oven.bump = ctx.bumps.oven;
    Ok(())
}
