use anchor_lang::prelude::*;

use crate::constants::RECENT_LEN;

/// The whole game lives in one account: the rules, the current round, and a
/// short on-chain history. A client subscribes to this single account and
/// gets the live pot, timer, feed and winners without an indexer.
///
/// The pot is held as lamports (COOK) in this same account, on top of its
/// rent-exempt balance.
#[account]
#[derive(InitSpace)]
pub struct Oven {
    pub authority: Pubkey,
    /// Cookie Jar community vault that receives `jar_bps` of every bake.
    pub jar: Pubkey,
    pub bake_price: u64,
    /// Each bake sets the deadline to `now + round_secs`.
    pub round_secs: i64,
    pub jar_bps: u16,
    /// Share of a settled pot that stays in the oven to seed the next round.
    pub carry_bps: u16,

    pub round: u64,
    pub pot: u64,
    pub last_baker: Pubkey,
    /// 0 while the round has no bakes (the timer starts on the first bake).
    pub deadline: i64,
    pub round_bakes: u32,

    pub total_bakes: u64,
    pub total_to_jar: u64,
    pub total_paid: u64,

    /// Newest first.
    pub recent_bakes: [BakeEntry; RECENT_LEN],
    /// Newest first.
    pub recent_winners: [WinnerEntry; RECENT_LEN],

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct BakeEntry {
    pub baker: Pubkey,
    pub at: i64,
    pub pot_after: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct WinnerEntry {
    pub round: u64,
    pub winner: Pubkey,
    pub prize: u64,
    pub bakes: u32,
    pub at: i64,
}

/// Inserts at the front and drops the oldest entry.
pub fn push_front<T: Copy>(list: &mut [T; RECENT_LEN], item: T) {
    list.copy_within(0..RECENT_LEN - 1, 1);
    list[0] = item;
}

#[event]
pub struct Baked {
    pub round: u64,
    pub baker: Pubkey,
    pub pot: u64,
    pub to_jar: u64,
    pub deadline: i64,
}

#[event]
pub struct Sweetened {
    pub round: u64,
    pub donor: Pubkey,
    pub amount: u64,
    pub pot: u64,
}

#[event]
pub struct Settled {
    pub round: u64,
    pub winner: Pubkey,
    pub prize: u64,
    pub carry: u64,
    pub bakes: u32,
}
