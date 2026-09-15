use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    last_batch::{constants::OVEN_SEED, state::Oven},
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const COOK: u64 = 1_000_000_000;
const PRICE: u64 = 10 * COOK;
const ROUND_SECS: i64 = 300;
const JAR_BPS: u16 = 500;
const CARRY_BPS: u16 = 1_000;

// Anchor custom error codes start at 6000, in declaration order.
const ERR_BAKE_PRICE_TOO_LOW: u32 = 6000;
const ERR_ROUND_OVER: u32 = 6004;
const ERR_ROUND_NOT_OVER: u32 = 6005;
// With no bakes the stored winner is the default key, which the runtime never
// lets through as writable, so Anchor's `mut` check stops settle before the
// handler's own `NoBakes` guard.
const ERR_CONSTRAINT_MUT: u32 = 2000;
const ERR_ZERO_AMOUNT: u32 = 6007;
const ERR_CONSTRAINT_ADDRESS: u32 = 2012;

struct Game {
    svm: LiteSVM,
    authority: Keypair,
    jar: Pubkey,
    oven: Pubkey,
}

impl Game {
    fn new() -> Self {
        let mut svm = LiteSVM::new();
        let bytes = include_bytes!(concat!(
            env!("CARGO_TARGET_TMPDIR"),
            "/../deploy/last_batch.so"
        ));
        svm.add_program(last_batch::id(), bytes).unwrap();
        let authority = Keypair::new();
        svm.airdrop(&authority.pubkey(), 100 * COOK).unwrap();
        // The real Cookie Jar is an existing, funded vault.
        let jar = Pubkey::new_unique();
        svm.airdrop(&jar, COOK).unwrap();
        let oven = Pubkey::find_program_address(&[OVEN_SEED], &last_batch::id()).0;
        let mut game = Game {
            svm,
            authority,
            jar,
            oven,
        };
        game.set_time(1_000_000);
        game
    }

    fn player(&mut self) -> Keypair {
        let k = Keypair::new();
        self.svm.airdrop(&k.pubkey(), 1_000 * COOK).unwrap();
        k
    }

    fn set_time(&mut self, unix: i64) {
        let mut clock: Clock = self.svm.get_sysvar();
        clock.unix_timestamp = unix;
        self.svm.set_sysvar(&clock);
    }

    fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    fn send(&mut self, ixs: &[Instruction], signers: &[&Keypair]) -> Result<(), u32> {
        self.svm.expire_blockhash();
        let blockhash = self.svm.latest_blockhash();
        let msg = Message::new_with_blockhash(ixs, Some(&signers[0].pubkey()), &blockhash);
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
        self.svm.send_transaction(tx).map(|_| ()).map_err(|e| match e.err {
            solana_transaction_error::TransactionError::InstructionError(
                _,
                solana_instruction_error::InstructionError::Custom(code),
            ) => code,
            other => panic!("unexpected error: {other:?}\n{:#?}", e.meta.logs),
        })
    }

    fn initialize_ix(&self, bake_price: u64) -> Instruction {
        Instruction::new_with_bytes(
            last_batch::id(),
            &last_batch::instruction::Initialize {
                bake_price,
                round_secs: ROUND_SECS,
                jar_bps: JAR_BPS,
                carry_bps: CARRY_BPS,
            }
            .data(),
            last_batch::accounts::Initialize {
                authority: self.authority.pubkey(),
                oven: self.oven,
                jar: self.jar,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    fn initialize(&mut self) {
        let ix = self.initialize_ix(PRICE);
        let authority = self.authority.insecure_clone();
        self.send(&[ix], &[&authority]).unwrap();
    }

    fn bake_ix(&self, baker: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            last_batch::id(),
            &last_batch::instruction::Bake {}.data(),
            last_batch::accounts::Bake {
                baker: *baker,
                oven: self.oven,
                jar: self.jar,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    fn settle_ix(&self, cranker: &Pubkey, winner: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            last_batch::id(),
            &last_batch::instruction::Settle {}.data(),
            last_batch::accounts::Settle {
                cranker: *cranker,
                oven: self.oven,
                winner: *winner,
            }
            .to_account_metas(None),
        )
    }

    fn sweeten_ix(&self, donor: &Pubkey, amount: u64) -> Instruction {
        Instruction::new_with_bytes(
            last_batch::id(),
            &last_batch::instruction::Sweeten { amount }.data(),
            last_batch::accounts::Sweeten {
                donor: *donor,
                oven: self.oven,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    fn bake(&mut self, baker: &Keypair) -> Result<(), u32> {
        let ix = self.bake_ix(&baker.pubkey());
        self.send(&[ix], &[baker])
    }

    fn oven_state(&self) -> Oven {
        let account = self.svm.get_account(&self.oven).unwrap();
        let mut data: &[u8] = &account.data;
        Oven::try_deserialize(&mut data).unwrap()
    }

    fn balance(&self, key: &Pubkey) -> u64 {
        self.svm.get_balance(key).unwrap_or(0)
    }

    /// The oven must always hold exactly its rent-exempt balance plus the pot.
    fn assert_pot_backed(&self) {
        let account = self.svm.get_account(&self.oven).unwrap();
        let rent = self.svm.minimum_balance_for_rent_exemption(account.data.len());
        assert_eq!(account.lamports, rent + self.oven_state().pot);
    }
}

#[test]
fn initialize_rejects_bad_price() {
    let mut g = Game::new();
    let ix = g.initialize_ix(1);
    let authority = g.authority.insecure_clone();
    assert_eq!(g.send(&[ix], &[&authority]), Err(ERR_BAKE_PRICE_TOO_LOW));
}

#[test]
fn bake_pays_jar_and_pot_and_starts_timer() {
    let mut g = Game::new();
    g.initialize();
    let alice = g.player();
    let jar_before = g.balance(&g.jar);
    let alice_before = g.balance(&alice.pubkey());

    g.bake(&alice).unwrap();

    let oven = g.oven_state();
    let to_jar = PRICE * JAR_BPS as u64 / 10_000;
    assert_eq!(g.balance(&g.jar) - jar_before, to_jar);
    assert_eq!(oven.pot, PRICE - to_jar);
    assert_eq!(alice_before - g.balance(&alice.pubkey()), PRICE + 5_000);
    assert_eq!(oven.last_baker, alice.pubkey());
    assert_eq!(oven.deadline, g.now() + ROUND_SECS);
    assert_eq!(oven.round, 1);
    assert_eq!(oven.round_bakes, 1);
    assert_eq!(oven.recent_bakes[0].baker, alice.pubkey());
    assert_eq!(oven.recent_bakes[0].pot_after, oven.pot);
    g.assert_pot_backed();
}

#[test]
fn each_bake_restarts_the_timer_and_takes_the_lead() {
    let mut g = Game::new();
    g.initialize();
    let alice = g.player();
    let bob = g.player();

    g.bake(&alice).unwrap();
    let t = g.now() + ROUND_SECS - 1;
    g.set_time(t);
    g.bake(&bob).unwrap();

    let oven = g.oven_state();
    assert_eq!(oven.last_baker, bob.pubkey());
    assert_eq!(oven.deadline, t + ROUND_SECS);
    assert_eq!(oven.recent_bakes[0].baker, bob.pubkey());
    assert_eq!(oven.recent_bakes[1].baker, alice.pubkey());
    g.assert_pot_backed();
}

#[test]
fn bake_is_rejected_after_the_timer_runs_out() {
    let mut g = Game::new();
    g.initialize();
    let alice = g.player();
    let bob = g.player();
    g.bake(&alice).unwrap();

    let deadline = g.oven_state().deadline;
    g.set_time(deadline);
    g.bake(&bob).unwrap(); // the last second still counts
    let deadline = g.oven_state().deadline;
    g.set_time(deadline + 1);
    assert_eq!(g.bake(&alice), Err(ERR_ROUND_OVER));
}

#[test]
fn settle_requires_bakes_and_an_expired_timer() {
    let mut g = Game::new();
    g.initialize();
    let alice = g.player();

    let ix = g.settle_ix(&alice.pubkey(), &Pubkey::default());
    assert_eq!(g.send(&[ix], &[&alice]), Err(ERR_CONSTRAINT_MUT));
    let ix = g.settle_ix(&alice.pubkey(), &alice.pubkey());
    assert_eq!(g.send(&[ix], &[&alice]), Err(ERR_CONSTRAINT_ADDRESS));

    g.bake(&alice).unwrap();
    let ix = g.settle_ix(&alice.pubkey(), &alice.pubkey());
    assert_eq!(g.send(&[ix], &[&alice]), Err(ERR_ROUND_NOT_OVER));
}

#[test]
fn settle_pays_last_baker_carries_the_rest_and_opens_next_round() {
    let mut g = Game::new();
    g.initialize();
    let alice = g.player();
    let bob = g.player();
    let carol = g.player();
    g.bake(&alice).unwrap();
    g.bake(&bob).unwrap();
    g.bake(&alice).unwrap();
    g.bake(&bob).unwrap();

    let pot = g.oven_state().pot;
    let deadline = g.oven_state().deadline;
    g.set_time(deadline + 1);

    // Paying anyone but the last baker is rejected.
    let ix = g.settle_ix(&carol.pubkey(), &alice.pubkey());
    assert_eq!(g.send(&[ix], &[&carol]), Err(ERR_CONSTRAINT_ADDRESS));

    let bob_before = g.balance(&bob.pubkey());
    let ix = g.settle_ix(&carol.pubkey(), &bob.pubkey());
    g.send(&[ix], &[&carol]).unwrap();

    let carry = pot * CARRY_BPS as u64 / 10_000;
    let oven = g.oven_state();
    assert_eq!(g.balance(&bob.pubkey()) - bob_before, pot - carry);
    assert_eq!(oven.pot, carry);
    assert_eq!(oven.round, 2);
    assert_eq!(oven.deadline, 0);
    assert_eq!(oven.round_bakes, 0);
    assert_eq!(oven.last_baker, Pubkey::default());
    assert_eq!(oven.recent_bakes[0].baker, Pubkey::default());
    assert_eq!(oven.recent_winners[0].winner, bob.pubkey());
    assert_eq!(oven.recent_winners[0].prize, pot - carry);
    assert_eq!(oven.recent_winners[0].bakes, 4);
    assert_eq!(oven.total_paid, pot - carry);
    g.assert_pot_backed();

    // Settling twice is impossible: the new round has no bakes.
    let ix = g.settle_ix(&carol.pubkey(), &bob.pubkey());
    assert_eq!(g.send(&[ix], &[&carol]), Err(ERR_CONSTRAINT_ADDRESS));
}

#[test]
fn winner_can_settle_and_bake_the_next_round_in_one_transaction() {
    let mut g = Game::new();
    g.initialize();
    let alice = g.player();
    g.bake(&alice).unwrap();
    let deadline = g.oven_state().deadline;
    g.set_time(deadline + 10);

    let settle = g.settle_ix(&alice.pubkey(), &alice.pubkey());
    let bake = g.bake_ix(&alice.pubkey());
    g.send(&[settle, bake], &[&alice]).unwrap();

    let oven = g.oven_state();
    assert_eq!(oven.round, 2);
    assert_eq!(oven.round_bakes, 1);
    assert_eq!(oven.last_baker, alice.pubkey());
    assert_eq!(oven.deadline, g.now() + ROUND_SECS);
    assert_eq!(oven.recent_winners[0].winner, alice.pubkey());
    g.assert_pot_backed();
}

#[test]
fn sweeten_grows_the_pot_without_taking_the_lead() {
    let mut g = Game::new();
    g.initialize();
    let alice = g.player();
    let donor = g.player();
    g.bake(&alice).unwrap();
    let before = g.oven_state();

    let ix = g.sweeten_ix(&donor.pubkey(), 0);
    assert_eq!(g.send(&[ix], &[&donor]), Err(ERR_ZERO_AMOUNT));

    let ix = g.sweeten_ix(&donor.pubkey(), 50 * COOK);
    g.send(&[ix], &[&donor]).unwrap();

    let after = g.oven_state();
    assert_eq!(after.pot, before.pot + 50 * COOK);
    assert_eq!(after.last_baker, alice.pubkey());
    assert_eq!(after.deadline, before.deadline);
    g.assert_pot_backed();
}

#[test]
fn recent_bakes_keep_the_newest_eight() {
    let mut g = Game::new();
    g.initialize();
    let players: Vec<Keypair> = (0..10).map(|_| g.player()).collect();
    for p in &players {
        g.bake(p).unwrap();
    }
    let oven = g.oven_state();
    for (i, entry) in oven.recent_bakes.iter().enumerate() {
        assert_eq!(entry.baker, players[9 - i].pubkey());
    }
    assert_eq!(oven.total_bakes, 10);
}
