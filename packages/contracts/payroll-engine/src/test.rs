use common::{PayFrequency, Role, WorkforceError};
use employee_registry::{EmployeeRegistry, EmployeeRegistryClient};
use organization::OrganizationClient;
use payroll_factory::{PayrollFactory, PayrollFactoryClient};
use soroban_sdk::{testutils::Address as _, token, vec, Address, BytesN, Env, Symbol};
use treasury::TreasuryClient;

use crate::{PayrollEngine, PayrollEngineClient};

const ORGANIZATION_WASM: &[u8] =
    include_bytes!("../../target/wasm32v1-none/release/organization.wasm");
const TREASURY_WASM: &[u8] = include_bytes!("../../target/wasm32v1-none/release/treasury.wasm");

struct TestCtx<'a> {
    engine: PayrollEngineClient<'a>,
    factory: PayrollFactoryClient<'a>,
    registry: EmployeeRegistryClient<'a>,
    token: token::TokenClient<'a>,
    token_admin: token::StellarAssetClient<'a>,
}

struct TestOrg<'a> {
    org_id: u64,
    treasury: TreasuryClient<'a>,
    finance: Address,
    hr: Address,
}

fn setup(env: &Env) -> TestCtx<'_> {
    let engine_id = env.register(PayrollEngine, ());
    let engine = PayrollEngineClient::new(env, &engine_id);
    let registry_id = env.register(EmployeeRegistry, ());
    let registry = EmployeeRegistryClient::new(env, &registry_id);
    let factory_id = env.register(PayrollFactory, ());
    let factory = PayrollFactoryClient::new(env, &factory_id);

    let admin = Address::generate(env);
    let token_admin_address = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(token_admin_address);
    let token_address = sac.address();
    let token = token::TokenClient::new(env, &token_address);
    let token_admin = token::StellarAssetClient::new(env, &token_address);
    let milestone_engine = Address::generate(env);

    let org_wasm_hash = env.deployer().upload_contract_wasm(ORGANIZATION_WASM);
    let treasury_wasm_hash = env.deployer().upload_contract_wasm(TREASURY_WASM);
    factory.initialize(
        &admin,
        &token_address,
        &org_wasm_hash,
        &treasury_wasm_hash,
        &registry_id,
        &engine_id,
        &milestone_engine,
    );
    registry.initialize(&factory_id);
    engine.initialize(&factory_id, &registry_id);

    TestCtx {
        engine,
        factory,
        registry,
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

#[test]
fn successful_run_pays_active_employees() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org = create_org(&env, &ctx, 1);

    let depositor = Address::generate(&env);
    ctx.token_admin.mint(&depositor, &10_000);
    org.treasury.deposit(&depositor, &10_000);

    let currency = Address::generate(&env);
    let wallet_1 = Address::generate(&env);
    let wallet_2 = Address::generate(&env);
    let id_1 = ctx.registry.register_employee(
        &org.hr,
        &org.org_id,
        &wallet_1,
        &1000,
        &currency,
        &PayFrequency::Monthly,
    );
    let id_2 = ctx.registry.register_employee(
        &org.hr,
        &org.org_id,
        &wallet_2,
        &2000,
        &currency,
        &PayFrequency::Monthly,
    );

    let result = ctx
        .engine
        .run_payroll(&org.finance, &org.org_id, &1, &vec![&env, id_1, id_2]);

    assert_eq!(result.succeeded, vec![&env, id_1, id_2]);
    assert!(result.failed.is_empty());
    assert_eq!(org.treasury.get_balance(), 7000);
    assert_eq!(ctx.token.balance(&wallet_1), 1000);
    assert_eq!(ctx.token.balance(&wallet_2), 2000);
}

#[test]
fn inactive_employee_produces_failure_not_abort() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org = create_org(&env, &ctx, 1);

    let depositor = Address::generate(&env);
    ctx.token_admin.mint(&depositor, &10_000);
    org.treasury.deposit(&depositor, &10_000);

    let currency = Address::generate(&env);
    let active_wallet = Address::generate(&env);
    let inactive_wallet = Address::generate(&env);
    let active_id = ctx.registry.register_employee(
        &org.hr,
        &org.org_id,
        &active_wallet,
        &1000,
        &currency,
        &PayFrequency::Monthly,
    );
    let inactive_id = ctx.registry.register_employee(
        &org.hr,
        &org.org_id,
        &inactive_wallet,
        &1500,
        &currency,
        &PayFrequency::Monthly,
    );
    ctx.registry
        .deactivate_employee(&org.hr, &org.org_id, &inactive_id);

    let result = ctx.engine.run_payroll(
        &org.finance,
        &org.org_id,
        &1,
        &vec![&env, active_id, inactive_id],
    );

    assert_eq!(result.succeeded, vec![&env, active_id]);
    assert_eq!(result.failed.len(), 1);
    assert_eq!(
        result.failed.get(0).unwrap(),
        (inactive_id, Symbol::new(&env, "employee_inactive"))
    );
    assert_eq!(ctx.token.balance(&active_wallet), 1000);
    assert_eq!(ctx.token.balance(&inactive_wallet), 0);
}

#[test]
fn double_execution_of_same_run_id_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org = create_org(&env, &ctx, 1);

    let depositor = Address::generate(&env);
    ctx.token_admin.mint(&depositor, &10_000);
    org.treasury.deposit(&depositor, &10_000);

    let currency = Address::generate(&env);
    let id = ctx.registry.register_employee(
        &org.hr,
        &org.org_id,
        &Address::generate(&env),
        &1000,
        &currency,
        &PayFrequency::Monthly,
    );

    ctx.engine
        .run_payroll(&org.finance, &org.org_id, &1, &vec![&env, id]);
    let result = ctx
        .engine
        .try_run_payroll(&org.finance, &org.org_id, &1, &vec![&env, id]);
    assert_eq!(result, Err(Ok(WorkforceError::RunAlreadyExecuted)));
}

#[test]
fn unauthorized_caller_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org = create_org(&env, &ctx, 1);

    // `hr` holds Hr, not Finance — cannot run payroll.
    let result = ctx
        .engine
        .try_run_payroll(&org.hr, &org.org_id, &1, &vec![&env, 1u64]);
    assert_eq!(result, Err(Ok(WorkforceError::NotAuthorized)));
}

#[test]
fn empty_batch_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org = create_org(&env, &ctx, 1);

    let result = ctx
        .engine
        .try_run_payroll(&org.finance, &org.org_id, &1, &vec![&env]);
    assert_eq!(result, Err(Ok(WorkforceError::EmptyBatch)));
}
