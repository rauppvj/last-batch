use anchor_lang::prelude::*;

#[constant]
pub const OVEN_SEED: &[u8] = b"oven";

/// How many recent bakes and recent winners the oven keeps on-chain.
pub const RECENT_LEN: usize = 8;

pub const BPS_DENOMINATOR: u64 = 10_000;

pub const MIN_BAKE_PRICE: u64 = 1_000_000; // 0.001 COOK
pub const MIN_ROUND_SECS: i64 = 30;
pub const MAX_ROUND_SECS: i64 = 86_400;
pub const MAX_JAR_BPS: u16 = 2_000;
pub const MAX_CARRY_BPS: u16 = 5_000;
