use anchor_lang::{prelude::*, system_program};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{push_front, BakeEntry, Baked, Oven},
};

#[derive(Accounts)]
pub struct Bake<'info> {
    #[account(mut)]
    pub baker: Signer<'info>,
    #[account(mut, seeds = [OVEN_SEED], bump = oven.bump)]
    pub oven: Account<'info, Oven>,
    /// CHECK: must be the Cookie Jar address stored at initialization.
    #[account(mut, address = oven.jar)]
    pub jar: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_bake(ctx: Context<Bake>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let oven = &ctx.accounts.oven;
    require!(oven.deadline == 0 || now <= oven.deadline, ErrorCode::RoundOver);

    let price = oven.bake_price;
    let to_jar = bps_of(price, oven.jar_bps)?;
    let to_pot = price.checked_sub(to_jar).ok_or(ErrorCode::Overflow)?;

    pay(
        &ctx.accounts.baker,
        ctx.accounts.jar.to_account_info(),
        to_jar,
    )?;
    pay(
        &ctx.accounts.baker,
        ctx.accounts.oven.to_account_info(),
        to_pot,
    )?;

    let baker = ctx.accounts.baker.key();
    let oven = &mut ctx.accounts.oven;
    oven.pot = oven.pot.checked_add(to_pot).ok_or(ErrorCode::Overflow)?;
    oven.last_baker = baker;
    oven.deadline = now.checked_add(oven.round_secs).ok_or(ErrorCode::Overflow)?;
    oven.round_bakes = oven.round_bakes.checked_add(1).ok_or(ErrorCode::Overflow)?;
    oven.total_bakes = oven.total_bakes.checked_add(1).ok_or(ErrorCode::Overflow)?;
    oven.total_to_jar = oven.total_to_jar.checked_add(to_jar).ok_or(ErrorCode::Overflow)?;
    let pot_after = oven.pot;
    push_front(
        &mut oven.recent_bakes,
        BakeEntry {
            baker,
            at: now,
            pot_after,
        },
    );

    emit!(Baked {
        round: oven.round,
        baker,
        pot: oven.pot,
        to_jar,
        deadline: oven.deadline,
    });
    Ok(())
}

pub(crate) fn bps_of(amount: u64, bps: u16) -> Result<u64> {
    let share = (amount as u128) * (bps as u128) / (BPS_DENOMINATOR as u128);
    u64::try_from(share).map_err(|_| ErrorCode::Overflow.into())
}

pub(crate) fn pay<'info>(from: &Signer<'info>, to: AccountInfo<'info>, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    system_program::transfer(
        CpiContext::new(
            system_program::ID,
            system_program::Transfer {
                from: from.to_account_info(),
                to,
            },
        ),
        amount,
    )
}
