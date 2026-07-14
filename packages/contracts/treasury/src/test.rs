use common::{Role, WorkforceError};
use organization::{Organization, OrganizationClient};
use soroban_sdk::{testutils::Address as _, token, Address, Env, Symbol};

use crate::{Treasury, TreasuryClient};

struct TestCtx<'a> {
    treasury: TreasuryClient<'a>,
    org: OrganizationClient<'a>,
    token_admin: token::StellarAssetClient<'a>,
    token: token::TokenClient<'a>,
    owner: Address,
    payroll_engine: Address,
    milestone_engine: Address,
}

fn setup(env: &Env) -> TestCtx<'_> {
    let owner = Address::generate(env);
    let payroll_engine = Address::generate(env);
    let milestone_engine = Address::generate(env);
    let employee_registry = Address::generate(env);
    let org_id = 1u64;

    // organization's own `treasury` field isn't exercised by these tests
    // (they test treasury in isolation), so a placeholder address is fine.
    let treasury_placeholder = Address::generate(env);
    let org_id_contract = env.register(
        Organization,
        (
            org_id,
            owner.clone(),
            treasury_placeholder,
            employee_registry,
            payroll_engine.clone(),
            milestone_engine.clone(),
        ),
    );
    let org = OrganizationClient::new(env, &org_id_contract);

    let token_admin_address = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(token_admin_address);
    let token_address = sac.address();
    let token = token::TokenClient::new(env, &token_address);
    let token_admin = token::StellarAssetClient::new(env, &token_address);

    let treasury_id = env.register(
        Treasury,
        (
            org_id,
            org_id_contract,
            token_address,
            payroll_engine.clone(),
            milestone_engine.clone(),
        ),
    );
    let treasury = TreasuryClient::new(env, &treasury_id);

    TestCtx {
        treasury,
        org,
        token_admin,
        token,
        owner,
        payroll_engine,
        milestone_engine,
    }
}

#[test]
fn deposit_by_anyone_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);

    let depositor = Address::generate(&env);
    ctx.token_admin.mint(&depositor, &1000);

    ctx.treasury.deposit(&depositor, &400);

    assert_eq!(ctx.treasury.get_balance(), 400);
    assert_eq!(ctx.token.balance(&depositor), 600);
}

#[test]
fn deposit_rejects_invalid_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);

    let depositor = Address::generate(&env);
    let result = ctx.treasury.try_deposit(&depositor, &0);
    assert_eq!(result, Err(Ok(WorkforceError::InvalidAmount)));
}

#[test]
fn withdraw_rejected_for_non_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);

    let depositor = Address::generate(&env);
    ctx.token_admin.mint(&depositor, &1000);
    ctx.treasury.deposit(&depositor, &500);

    let finance = Address::generate(&env);
    ctx.org.grant_role(&ctx.owner, &finance, &Role::Finance);

    let recipient = Address::generate(&env);
    let result = ctx.treasury.try_withdraw(&finance, &recipient, &100);
    assert_eq!(result, Err(Ok(WorkforceError::NotAuthorized)));
}

#[test]
fn withdraw_succeeds_for_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);

    let depositor = Address::generate(&env);
    ctx.token_admin.mint(&depositor, &1000);
    ctx.treasury.deposit(&depositor, &500);

    let recipient = Address::generate(&env);
    ctx.treasury.withdraw(&ctx.owner, &recipient, &200);

    assert_eq!(ctx.treasury.get_balance(), 300);
    assert_eq!(ctx.token.balance(&recipient), 200);
}

#[test]
fn withdraw_rejects_insufficient_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);

    let recipient = Address::generate(&env);
    let result = ctx.treasury.try_withdraw(&ctx.owner, &recipient, &50);
    assert_eq!(result, Err(Ok(WorkforceError::InsufficientBalance)));
}

#[test]
fn transfer_out_rejected_when_spender_not_authorized() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);

    let depositor = Address::generate(&env);
    ctx.token_admin.mint(&depositor, &1000);
    ctx.treasury.deposit(&depositor, &500);

    let finance = Address::generate(&env);
    ctx.org.grant_role(&ctx.owner, &finance, &Role::Finance);

    let unauthorized_spender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let result = ctx.treasury.try_transfer_out(
        &unauthorized_spender,
        &finance,
        &recipient,
        &100,
        &Symbol::new(&env, "payroll"),
    );
    assert_eq!(result, Err(Ok(WorkforceError::NotAuthorizedSpender)));
}

#[test]
fn transfer_out_rejected_when_authorizer_lacks_finance() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);

    let depositor = Address::generate(&env);
    ctx.token_admin.mint(&depositor, &1000);
    ctx.treasury.deposit(&depositor, &500);

    let hr = Address::generate(&env);
    ctx.org.grant_role(&ctx.owner, &hr, &Role::Hr);

    let recipient = Address::generate(&env);
    let result = ctx.treasury.try_transfer_out(
        &ctx.payroll_engine,
        &hr,
        &recipient,
        &100,
        &Symbol::new(&env, "payroll"),
    );
    assert_eq!(result, Err(Ok(WorkforceError::NotAuthorized)));
}

#[test]
fn transfer_out_succeeds_when_spender_authorized_and_authorizer_has_finance() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);

    let depositor = Address::generate(&env);
    ctx.token_admin.mint(&depositor, &1000);
    ctx.treasury.deposit(&depositor, &500);

    let finance = Address::generate(&env);
    ctx.org.grant_role(&ctx.owner, &finance, &Role::Finance);

    let recipient = Address::generate(&env);
    ctx.treasury.transfer_out(
        &ctx.milestone_engine,
        &finance,
        &recipient,
        &150,
        &Symbol::new(&env, "milestone_fund"),
    );

    assert_eq!(ctx.treasury.get_balance(), 350);
    assert_eq!(ctx.token.balance(&recipient), 150);
    assert_eq!(ctx.token.balance(&ctx.treasury.address), 350);
}

#[test]
fn transfer_out_rejects_insufficient_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);

    let finance = Address::generate(&env);
    ctx.org.grant_role(&ctx.owner, &finance, &Role::Finance);

    let recipient = Address::generate(&env);
    let result = ctx.treasury.try_transfer_out(
        &ctx.payroll_engine,
        &finance,
        &recipient,
        &1,
        &Symbol::new(&env, "payroll"),
    );
    assert_eq!(result, Err(Ok(WorkforceError::InsufficientBalance)));
}
