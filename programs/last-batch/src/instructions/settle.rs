use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    instructions::bake::bps_of,
    state::{push_front, BakeEntry, Oven, Settled, WinnerEntry},
};

/// Permissionless: once the timer runs out anyone can hand the pot to the last
/// baker and open the next round. The app bundles it in front of a bake.
#[derive(Accounts)]
pub struct Settle<'info> {
    pub cranker: Signer<'info>,
    #[account(mut, seeds = [OVEN_SEED], bump = oven.bump)]
    pub oven: Account<'info, Oven>,
    /// CHECK: must be the last baker of the round; it only receives lamports.
    #[account(mut, address = oven.last_baker)]
    pub winner: UncheckedAccount<'info>,
}

pub fn handle_settle(ctx: Context<Settle>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let oven = &ctx.accounts.oven;
    require!(oven.round_bakes > 0, ErrorCode::NoBakes);
    require!(now > oven.deadline, ErrorCode::RoundNotOver);

    let carry = bps_of(oven.pot, oven.carry_bps)?;
    let prize = oven.pot.checked_sub(carry).ok_or(ErrorCode::Overflow)?;

    // The oven is owned by this program, so it can debit its own lamports.
    // Only the tracked pot moves; the rent-exempt balance stays.
    ctx.accounts.oven.sub_lamports(prize)?;
    ctx.accounts.winner.add_lamports(prize)?;

    let winner = ctx.accounts.winner.key();
    let oven = &mut ctx.accounts.oven;
    let round = oven.round;
    let bakes = oven.round_bakes;
    push_front(
        &mut oven.recent_winners,
        WinnerEntry {
            round,
            winner,
            prize,
            bakes,
            at: now,
        },
    );
    oven.total_paid = oven.total_paid.checked_add(prize).ok_or(ErrorCode::Overflow)?;

    oven.round = round.checked_add(1).ok_or(ErrorCode::Overflow)?;
    oven.pot = carry;
    oven.last_baker = Pubkey::default();
    oven.deadline = 0;
    oven.round_bakes = 0;
    oven.recent_bakes = [BakeEntry::default(); RECENT_LEN];

    emit!(Settled {
        round,
        winner,
        prize,
        carry,
        bakes,
    });
    Ok(())
}
