use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Bake price is below the minimum")]
    BakePriceTooLow,
    #[msg("Round timer is outside the allowed range")]
    RoundSecsOutOfRange,
    #[msg("Cookie Jar share is above the maximum")]
    JarBpsTooHigh,
    #[msg("Carry share is above the maximum")]
    CarryBpsTooHigh,
    #[msg("The timer ran out: settle the round before baking again")]
    RoundOver,
    #[msg("The round is still running")]
    RoundNotOver,
    #[msg("Nobody has baked in this round yet")]
    NoBakes,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
}
