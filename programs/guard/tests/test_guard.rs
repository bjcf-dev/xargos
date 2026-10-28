//! LiteSVM tests for the guard. They load `target/deploy/guard.so`, so run `anchor build` first.

use anchor_lang::{
    solana_program::{instruction::Instruction, pubkey::Pubkey, system_program},
    InstructionData, ToAccountMetas,
};
use guard::error::GuardError;
use litesvm::{types::FailedTransactionMetadata, LiteSVM};
use litesvm_token::{CreateAccount, CreateMint, MintTo};
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;

const USDC_DECIMALS: u8 = 6;

struct Env {
    svm: LiteSVM,
    payer: Keypair,
    agent: Pubkey,
    mint: Pubkey,
    token_account: Pubkey,
    snapshot: Pubkey,
}

fn snapshot_pda(agent: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"snap", agent.as_ref(), mint.as_ref()], &guard::ID).0
}

fn new_mint(svm: &mut LiteSVM, payer: &Keypair) -> Pubkey {
    CreateMint::new(svm, payer)
        .decimals(USDC_DECIMALS)
        .authority(&payer.pubkey())
        .send()
        .unwrap()
}

fn new_token_account(svm: &mut LiteSVM, payer: &Keypair, mint: &Pubkey, owner: &Pubkey) -> Pubkey {
    CreateAccount::new(svm, payer, mint)
        .owner(owner)
        .send()
        .unwrap()
}

fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    ix: Instruction,
) -> Result<litesvm::types::TransactionMetadata, FailedTransactionMetadata> {
    let tx = Transaction::new(
        &[payer],
        Message::new(&[ix], Some(&payer.pubkey())),
        svm.latest_blockhash(),
    );
    let result = svm.send_transaction(tx);
    // Two identical instructions in a row would otherwise be rejected as already processed.
    svm.expire_blockhash();
    result
}

fn init_snapshot_ix(env: &Env) -> Instruction {
    Instruction {
        program_id: guard::ID,
        accounts: guard::accounts::InitSnapshot {
            payer: env.payer.pubkey(),
            agent: env.agent,
            mint: env.mint,
            snapshot: env.snapshot,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: guard::instruction::InitSnapshot {}.data(),
    }
}

fn snapshot_ix(token_account: &Pubkey, snapshot: &Pubkey) -> Instruction {
    Instruction {
        program_id: guard::ID,
        accounts: guard::accounts::TakeSnapshot {
            agent_token_account: *token_account,
            snapshot: *snapshot,
        }
        .to_account_metas(None),
        data: guard::instruction::Snapshot {}.data(),
    }
}

fn assert_ix(token_account: &Pubkey, snapshot: &Pubkey, min_delta: u64) -> Instruction {
    Instruction {
        program_id: guard::ID,
        accounts: guard::accounts::AssertMinDelta {
            agent_token_account: *token_account,
            snapshot: *snapshot,
        }
        .to_account_metas(None),
        data: guard::instruction::AssertMinDelta { min_delta }.data(),
    }
}

/// A mint, the agent's token account and its initialized snapshot PDA.
fn setup() -> Env {
    let mut svm = LiteSVM::new();
    let so = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/guard.so");
    svm.add_program_from_file(guard::ID, so)
        .expect("run `anchor build` before `cargo test`");

    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();

    let agent = Pubkey::new_unique();
    let mint = new_mint(&mut svm, &payer);
    let token_account = new_token_account(&mut svm, &payer, &mint, &agent);
    let snapshot = snapshot_pda(&agent, &mint);

    let mut env = Env {
        svm,
        payer,
        agent,
        mint,
        token_account,
        snapshot,
    };
    let ix = init_snapshot_ix(&env);
    send(&mut env.svm, &env.payer, ix).unwrap();
    env
}

fn mint_to(env: &mut Env, amount: u64) {
    MintTo::new(
        &mut env.svm,
        &env.payer,
        &env.mint,
        &env.token_account,
        amount,
    )
    .send()
    .unwrap();
}

fn take_snapshot(env: &mut Env) {
    let ix = snapshot_ix(&env.token_account, &env.snapshot);
    send(&mut env.svm, &env.payer, ix).unwrap();
}

fn assert_fails_with(
    result: Result<litesvm::types::TransactionMetadata, FailedTransactionMetadata>,
    error: GuardError,
) -> FailedTransactionMetadata {
    let failed = result.expect_err("the instruction should have failed");
    let code = u32::from(error);
    assert!(
        format!("{:?}", failed.err).contains(&format!("Custom({code})")),
        "expected custom error {code}, got {:?}",
        failed.err
    );
    failed
}

#[test]
fn passes_when_the_delta_is_enough() {
    let mut env = setup();
    take_snapshot(&mut env);
    mint_to(&mut env, 10_000_000);

    let ix = assert_ix(&env.token_account, &env.snapshot, 10_000_000);
    send(&mut env.svm, &env.payer, ix).unwrap();
}

#[test]
fn fails_with_min_delta_not_met_and_logs_guard_fail() {
    let mut env = setup();
    take_snapshot(&mut env);
    mint_to(&mut env, 5_000_000);

    let ix = assert_ix(&env.token_account, &env.snapshot, 10_000_000);
    let failed = assert_fails_with(
        send(&mut env.svm, &env.payer, ix),
        GuardError::MinDeltaNotMet,
    );
    assert!(
        failed
            .meta
            .logs
            .iter()
            .any(|line| line.contains("GUARD_FAIL received=5000000 min=10000000")),
        "GUARD_FAIL log not found in {:?}",
        failed.meta.logs
    );
}

#[test]
fn counts_only_what_was_received_since_the_snapshot() {
    let mut env = setup();
    mint_to(&mut env, 20_000_000); // balance the agent already had
    take_snapshot(&mut env);

    let ix = assert_ix(&env.token_account, &env.snapshot, 1);
    assert_fails_with(
        send(&mut env.svm, &env.payer, ix),
        GuardError::MinDeltaNotMet,
    );
}

#[test]
fn fails_when_the_snapshot_is_from_another_slot() {
    let mut env = setup();
    take_snapshot(&mut env);
    mint_to(&mut env, 10_000_000);
    env.svm
        .warp_to_slot(env.svm.get_sysvar::<solana_clock::Clock>().slot + 1);

    let ix = assert_ix(&env.token_account, &env.snapshot, 10_000_000);
    assert_fails_with(
        send(&mut env.svm, &env.payer, ix),
        GuardError::StaleSnapshot,
    );
}

#[test]
fn fails_when_the_token_account_has_another_owner() {
    let mut env = setup();
    take_snapshot(&mut env);
    let other_owner = Pubkey::new_unique();
    let foreign = new_token_account(&mut env.svm, &env.payer, &env.mint, &other_owner);

    let ix = assert_ix(&foreign, &env.snapshot, 1);
    assert_fails_with(send(&mut env.svm, &env.payer, ix), GuardError::InvalidOwner);
}

#[test]
fn fails_when_the_token_account_has_another_mint() {
    let mut env = setup();
    take_snapshot(&mut env);
    let other_mint = new_mint(&mut env.svm, &env.payer);
    let wrong_mint_account = new_token_account(&mut env.svm, &env.payer, &other_mint, &env.agent);

    let ix = assert_ix(&wrong_mint_account, &env.snapshot, 1);
    assert_fails_with(send(&mut env.svm, &env.payer, ix), GuardError::InvalidMint);
}

#[test]
fn fails_when_min_delta_is_zero() {
    let mut env = setup();
    take_snapshot(&mut env);

    let ix = assert_ix(&env.token_account, &env.snapshot, 0);
    assert_fails_with(
        send(&mut env.svm, &env.payer, ix),
        GuardError::InvalidMinDelta,
    );
}
