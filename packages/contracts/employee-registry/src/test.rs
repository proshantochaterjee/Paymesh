use common::{PayFrequency, Role, WorkforceError};
use organization::OrganizationClient;
use payroll_factory::{PayrollFactory, PayrollFactoryClient};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

use crate::{EmployeeRegistry, EmployeeRegistryClient};

const ORGANIZATION_WASM: &[u8] =
    include_bytes!("../../target/wasm32v1-none/release/organization.wasm");
const TREASURY_WASM: &[u8] = include_bytes!("../../target/wasm32v1-none/release/treasury.wasm");

struct TestOrg<'a> {
    org_id: u64,
    org: OrganizationClient<'a>,
    owner: Address,
}

struct TestCtx<'a> {
    registry: EmployeeRegistryClient<'a>,
    factory: PayrollFactoryClient<'a>,
}

fn setup(env: &Env) -> TestCtx<'_> {
    let registry_id = env.register(EmployeeRegistry, ());
    let registry = EmployeeRegistryClient::new(env, &registry_id);

    let factory_id = env.register(PayrollFactory, ());
    let factory = PayrollFactoryClient::new(env, &factory_id);

    let admin = Address::generate(env);
    let usdc_token = Address::generate(env);
    let payroll_engine = Address::generate(env);
    let milestone_engine = Address::generate(env);
    let org_wasm_hash = env.deployer().upload_contract_wasm(ORGANIZATION_WASM);
    let treasury_wasm_hash = env.deployer().upload_contract_wasm(TREASURY_WASM);
    factory.initialize(
        &admin,
        &usdc_token,
        &org_wasm_hash,
        &treasury_wasm_hash,
        &registry_id,
        &payroll_engine,
        &milestone_engine,
    );

    registry.initialize(&factory_id);

    TestCtx { registry, factory }
}

fn create_org<'a>(env: &'a Env, ctx: &TestCtx<'a>, salt_byte: u8) -> TestOrg<'a> {
    let owner = Address::generate(env);
    let salt = BytesN::from_array(env, &[salt_byte; 32]);
    let org_id = ctx.factory.create_organization(&owner, &salt);
    let record = ctx.factory.get_organization(&org_id);
    let org = OrganizationClient::new(env, &record.organization);
    TestOrg { org_id, org, owner }
}

#[test]
fn register_employee_by_hr_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org_a = create_org(&env, &ctx, 1);

    let hr = Address::generate(&env);
    org_a.org.grant_role(&org_a.owner, &hr, &Role::Hr);

    let wallet = Address::generate(&env);
    let currency = Address::generate(&env);
    let employee_id = ctx.registry.register_employee(
        &hr,
        &org_a.org_id,
        &wallet,
        &6000,
        &currency,
        &PayFrequency::Monthly,
    );
    assert_eq!(employee_id, 1);

    let record = ctx.registry.get_employee(&org_a.org_id, &employee_id);
    assert_eq!(record.wallet, wallet);
    assert_eq!(record.salary, 6000);
    assert!(record.active);
}

#[test]
fn register_employee_rejects_non_hr_caller() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org_a = create_org(&env, &ctx, 1);

    let finance = Address::generate(&env);
    org_a.org.grant_role(&org_a.owner, &finance, &Role::Finance);

    let wallet = Address::generate(&env);
    let currency = Address::generate(&env);
    let result = ctx.registry.try_register_employee(
        &finance,
        &org_a.org_id,
        &wallet,
        &6000,
        &currency,
        &PayFrequency::Monthly,
    );
    assert_eq!(result, Err(Ok(WorkforceError::NotAuthorized)));
}

#[test]
fn register_employee_rejects_invalid_salary() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org_a = create_org(&env, &ctx, 1);

    let hr = Address::generate(&env);
    org_a.org.grant_role(&org_a.owner, &hr, &Role::Hr);

    let wallet = Address::generate(&env);
    let currency = Address::generate(&env);
    let result = ctx.registry.try_register_employee(
        &hr,
        &org_a.org_id,
        &wallet,
        &0,
        &currency,
        &PayFrequency::Monthly,
    );
    assert_eq!(result, Err(Ok(WorkforceError::InvalidSalary)));
}

#[test]
fn update_and_deactivate_employee() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org_a = create_org(&env, &ctx, 1);

    let hr = Address::generate(&env);
    org_a.org.grant_role(&org_a.owner, &hr, &Role::Hr);

    let wallet = Address::generate(&env);
    let currency = Address::generate(&env);
    let employee_id = ctx.registry.register_employee(
        &hr,
        &org_a.org_id,
        &wallet,
        &6000,
        &currency,
        &PayFrequency::Monthly,
    );

    ctx.registry.update_employee(
        &hr,
        &org_a.org_id,
        &employee_id,
        &7000,
        &PayFrequency::BiWeekly,
    );
    let record = ctx.registry.get_employee(&org_a.org_id, &employee_id);
    assert_eq!(record.salary, 7000);
    assert_eq!(record.frequency, PayFrequency::BiWeekly);
    assert!(record.active);

    ctx.registry
        .deactivate_employee(&hr, &org_a.org_id, &employee_id);
    let record = ctx.registry.get_employee(&org_a.org_id, &employee_id);
    assert!(!record.active);
}

#[test]
fn get_employee_errors_when_not_found() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org_a = create_org(&env, &ctx, 1);

    let result = ctx.registry.try_get_employee(&org_a.org_id, &999);
    assert_eq!(result, Err(Ok(WorkforceError::EmployeeNotFound)));
}

#[test]
fn list_active_employee_ids_excludes_inactive() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org_a = create_org(&env, &ctx, 1);

    let hr = Address::generate(&env);
    org_a.org.grant_role(&org_a.owner, &hr, &Role::Hr);
    let currency = Address::generate(&env);

    let id_1 = ctx.registry.register_employee(
        &hr,
        &org_a.org_id,
        &Address::generate(&env),
        &6000,
        &currency,
        &PayFrequency::Monthly,
    );
    let id_2 = ctx.registry.register_employee(
        &hr,
        &org_a.org_id,
        &Address::generate(&env),
        &7000,
        &currency,
        &PayFrequency::Weekly,
    );
    ctx.registry.deactivate_employee(&hr, &org_a.org_id, &id_2);

    let active = ctx.registry.list_active_employee_ids(&org_a.org_id);
    assert_eq!(active, soroban_sdk::vec![&env, id_1]);
}

#[test]
fn employees_are_isolated_per_org() {
    let env = Env::default();
    env.mock_all_auths();
    let ctx = setup(&env);
    let org_a = create_org(&env, &ctx, 1);
    let org_b = create_org(&env, &ctx, 2);

    let hr_a = Address::generate(&env);
    org_a.org.grant_role(&org_a.owner, &hr_a, &Role::Hr);
    let currency = Address::generate(&env);

    let employee_id = ctx.registry.register_employee(
        &hr_a,
        &org_a.org_id,
        &Address::generate(&env),
        &6000,
        &currency,
        &PayFrequency::Monthly,
    );

    // Same employee_id under a different org_id must not resolve.
    let result = ctx.registry.try_get_employee(&org_b.org_id, &employee_id);
    assert_eq!(result, Err(Ok(WorkforceError::EmployeeNotFound)));

    // An HR of org B cannot manage org A's employee — cross-org isolation.
    let hr_b = Address::generate(&env);
    org_b.org.grant_role(&org_b.owner, &hr_b, &Role::Hr);
    let cross_result = ctx.registry.try_update_employee(
        &hr_b,
        &org_a.org_id,
        &employee_id,
        &1,
        &PayFrequency::Weekly,
    );
    assert_eq!(cross_result, Err(Ok(WorkforceError::NotAuthorized)));
}
