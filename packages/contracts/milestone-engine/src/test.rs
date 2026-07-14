use common::{Role, WorkforceError};
use organization::OrganizationClient;
use payroll_factory::{PayrollFactory, PayrollFactoryClient};
use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env};
use treasury::TreasuryClient;

use crate::{MilestoneEngine, MilestoneEngineClient, MilestoneStatus};

const ORGANIZATION_WASM: &[u8] =
    include_bytes!("../../target/wasm32v1-none/release/organization.wasm");
const TREASURY_WASM: &[u8] = include_bytes!("../../target/wasm32v1-none/release/treasury.wasm");

struct TestOrg<'a> {
    org_id: u64,
    treasury: TreasuryClient<'a>,
    finance: Address,
    hr: Address,
}

struct TestCtx<'a> {
    engine: MilestoneEngineClient<'a>,
    factory: PayrollFactoryClient<'a>,
    token: token::TokenClient<'a>,
    token_admin: token::StellarAssetClient<'a>,
}

fn setup(env: &Env) -> TestCtx<'_> {
    let engine_id = env.register(MilestoneEngine, ());
    let engine = MilestoneEngineClient::new(env, &engine_id);
    let factory_id = env.register(PayrollFactory, ());
    let factory = PayrollFactoryClient::new(env, &factory_id);

    let admin = Address::generate(env);
    let token_admin_address = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(token_admin_address);
    let token_address = sac.address();
    let token = token::TokenClient::new(env, &token_address);
    let token_admin = token::StellarAssetClient::new(env, &token_address);
    let employee_registry = Address::generate(env);
    let payroll_engine = Address::generate(env);

    let org_wasm_hash = env.deployer().upload_contract_wasm(ORGANIZATION_WASM);
    let treasury_wasm_hash = env.deployer().upload_contract_wasm(TREASURY_WASM);
    factory.initialize(
        &admin,
        &token_address,
        &org_wasm_hash,
        &treasury_wasm_hash,
        &employee_registry,
        &payroll_engine,
        &engine_id,
    );
    engine.initialize(&factory_id, &token_address);

    TestCtx {
        engine,
        factory,
        token,
        token_admin,
    }
}

fn create_org<'a>(env: &'a Env, ctx: &TestCtx<'a>, salt_byte: u8) -> TestOrg<'a> {
    let owner = Address::generate(env);
    let salt = BytesN::from_array(env, &[salt_byte; 32]);
    let org_id = ctx.factory.create_organization(&owner, &salt);
    let record = ctx.factory.get_organization(&org_id);
    let org = OrganizationClient::new(env, &record.organization);
    let treasury = TreasuryClient::new(env, &record.treasury);

    let finance = Address::generate(env);
    org.grant_role(&owner, &finance, &Role::Finance);
    let hr = Address::generate(env);
    org.grant_role(&owner, &hr, &Role::Hr);

    TestOrg {
        org_id,
        treasury,
        finance,
        hr,
    }
}

fn fund_treasury(env: &Env, ctx: &TestCtx, org: &TestOrg, amount: i128) {
    let depositor = Address::generate(env);
    ctx.token_admin.mint(&depositor, &amount);
    org.treasury.deposit(&depositor, &amount);
}

#[test]
fn full_happy_path_state_machine() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org = create_org(&env, &ctx, 1);
    fund_treasury(&env, &ctx, &org, 5000);

    let contractor = Address::generate(&env);
    let milestone_id = ctx
        .engine
        .create_milestone(&org.finance, &org.org_id, &contractor, &1000);
    assert_eq!(
        ctx.engine.get_milestone(&org.org_id, &milestone_id).status,
        MilestoneStatus::Draft
    );

    ctx.engine
        .fund_milestone(&org.finance, &org.org_id, &milestone_id);
    assert_eq!(
        ctx.engine.get_milestone(&org.org_id, &milestone_id).status,
        MilestoneStatus::Funded
    );
    assert_eq!(org.treasury.get_balance(), 4000);

    ctx.engine
        .approve_milestone(&org.finance, &org.org_id, &milestone_id);
    assert_eq!(
        ctx.engine.get_milestone(&org.org_id, &milestone_id).status,
        MilestoneStatus::Approved
    );

    ctx.engine
        .release_milestone(&org.finance, &org.org_id, &milestone_id);
    assert_eq!(
        ctx.engine.get_milestone(&org.org_id, &milestone_id).status,
        MilestoneStatus::Released
    );
    assert_eq!(ctx.token.balance(&contractor), 1000);

    // Double-release rejected.
    let result = ctx
        .engine
        .try_release_milestone(&org.finance, &org.org_id, &milestone_id);
    assert_eq!(result, Err(Ok(WorkforceError::InvalidStateTransition)));
}

#[test]
fn cancel_from_draft_is_a_no_op_refund() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org = create_org(&env, &ctx, 1);

    let contractor = Address::generate(&env);
    let milestone_id = ctx
        .engine
        .create_milestone(&org.finance, &org.org_id, &contractor, &1000);

    ctx.engine
        .cancel_milestone(&org.finance, &org.org_id, &milestone_id);
    let record = ctx.engine.get_milestone(&org.org_id, &milestone_id);
    assert_eq!(record.status, MilestoneStatus::Cancelled);
}

#[test]
fn cancel_from_funded_refunds_treasury() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org = create_org(&env, &ctx, 1);
    fund_treasury(&env, &ctx, &org, 5000);

    let contractor = Address::generate(&env);
    let milestone_id = ctx
        .engine
        .create_milestone(&org.finance, &org.org_id, &contractor, &1000);
    ctx.engine
        .fund_milestone(&org.finance, &org.org_id, &milestone_id);
    assert_eq!(org.treasury.get_balance(), 4000);

    ctx.engine
        .cancel_milestone(&org.finance, &org.org_id, &milestone_id);
    assert_eq!(
        ctx.engine.get_milestone(&org.org_id, &milestone_id).status,
        MilestoneStatus::Cancelled
    );
    assert_eq!(org.treasury.get_balance(), 5000);
}

#[test]
fn cancel_rejected_from_approved_and_released() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org = create_org(&env, &ctx, 1);
    fund_treasury(&env, &ctx, &org, 5000);

    let contractor = Address::generate(&env);
    let milestone_id = ctx
        .engine
        .create_milestone(&org.finance, &org.org_id, &contractor, &1000);
    ctx.engine
        .fund_milestone(&org.finance, &org.org_id, &milestone_id);
    ctx.engine
        .approve_milestone(&org.finance, &org.org_id, &milestone_id);

    let result = ctx
        .engine
        .try_cancel_milestone(&org.finance, &org.org_id, &milestone_id);
    assert_eq!(result, Err(Ok(WorkforceError::InvalidStateTransition)));

    ctx.engine
        .release_milestone(&org.finance, &org.org_id, &milestone_id);
    let result = ctx
        .engine
        .try_cancel_milestone(&org.finance, &org.org_id, &milestone_id);
    assert_eq!(result, Err(Ok(WorkforceError::InvalidStateTransition)));
}

#[test]
fn unauthorized_caller_rejected_at_every_transition() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org = create_org(&env, &ctx, 1);
    fund_treasury(&env, &ctx, &org, 5000);

    let contractor = Address::generate(&env);
    // `hr` holds Hr, not Finance — cannot create, fund, approve, release, or cancel.
    let create_result = ctx
        .engine
        .try_create_milestone(&org.hr, &org.org_id, &contractor, &1000);
    assert_eq!(create_result, Err(Ok(WorkforceError::NotAuthorized)));

    let milestone_id = ctx
        .engine
        .create_milestone(&org.finance, &org.org_id, &contractor, &1000);

    let fund_result = ctx
        .engine
        .try_fund_milestone(&org.hr, &org.org_id, &milestone_id);
    assert_eq!(fund_result, Err(Ok(WorkforceError::NotAuthorized)));

    ctx.engine
        .fund_milestone(&org.finance, &org.org_id, &milestone_id);
    let approve_result = ctx
        .engine
        .try_approve_milestone(&org.hr, &org.org_id, &milestone_id);
    assert_eq!(approve_result, Err(Ok(WorkforceError::NotAuthorized)));
}

#[test]
fn get_milestone_errors_when_not_found() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org = create_org(&env, &ctx, 1);

    let result = ctx.engine.try_get_milestone(&org.org_id, &999);
    assert_eq!(result, Err(Ok(WorkforceError::MilestoneNotFound)));
}
