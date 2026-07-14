use common::WorkforceError;
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, Symbol};

use crate::{PayrollFactory, PayrollFactoryClient};

fn setup(env: &Env) -> (PayrollFactoryClient<'_>, Address, Address) {
    let contract_id = env.register(PayrollFactory, ());
    let client = PayrollFactoryClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let usdc_token = Address::generate(env);
    (client, admin, usdc_token)
}

fn dummy_hash(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

// `create_organization` deploys real `organization`/`treasury` WASM via
// `deploy_v2` — Soroban has no way to deploy a contract in tests without
// actual bytecode. Raw bytes are embedded from the sibling crates' compiled
// release output (rather than mocked), and their own real `OrganizationClient`/
// `TreasuryClient` types (already dev-dependencies) are used to inspect the
// deployed instances — `soroban_sdk::contractimport!` was tried first but
// generates a second, colliding `__constructor` item when two different
// constructor-having contracts are imported into the same crate. This
// requires `cargo build -p organization -p treasury --target wasm32v1-none
// --release` to have already run (see docs/CI_CD.md's `contracts.yml`,
// which builds before testing for exactly this reason).
const ORGANIZATION_WASM: &[u8] =
    include_bytes!("../../target/wasm32v1-none/release/organization.wasm");
const TREASURY_WASM: &[u8] = include_bytes!("../../target/wasm32v1-none/release/treasury.wasm");

#[test]
fn create_organization_deploys_real_contracts_and_registers_them() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _) = setup(&env);
    let employee_registry = Address::generate(&env);
    let payroll_engine = Address::generate(&env);
    let milestone_engine = Address::generate(&env);
    // A real deployed token contract, since the created treasury's
    // `get_balance()` genuinely calls into it (unlike the other tests in
    // this file, which never exercise a deployed treasury).
    let usdc_token = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();

    let org_wasm_hash = env.deployer().upload_contract_wasm(ORGANIZATION_WASM);
    let treasury_wasm_hash = env.deployer().upload_contract_wasm(TREASURY_WASM);

    client.initialize(
        &admin,
        &usdc_token,
        &org_wasm_hash,
        &treasury_wasm_hash,
        &employee_registry,
        &payroll_engine,
        &milestone_engine,
    );

    let owner = Address::generate(&env);
    let salt_a = BytesN::from_array(&env, &[1u8; 32]);
    let org_id_a = client.create_organization(&owner, &salt_a);
    assert_eq!(org_id_a, 1);

    let record = client.get_organization(&org_id_a);
    let org_client = organization::OrganizationClient::new(&env, &record.organization);
    assert_eq!(org_client.get_role(&owner), Some(common::Role::Owner));
    let treasury_client = treasury::TreasuryClient::new(&env, &record.treasury);
    assert_eq!(treasury_client.get_balance(), 0);

    // A second org gets a distinct, sequential ID and distinct addresses.
    let salt_b = BytesN::from_array(&env, &[2u8; 32]);
    let org_id_b = client.create_organization(&owner, &salt_b);
    assert_eq!(org_id_b, 2);
    let record_b = client.get_organization(&org_id_b);
    assert_ne!(record.organization, record_b.organization);
    assert_ne!(record.treasury, record_b.treasury);
}

#[test]
fn initialize_sets_config_and_rejects_second_call() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, usdc_token) = setup(&env);
    let employee_registry = Address::generate(&env);
    let payroll_engine = Address::generate(&env);
    let milestone_engine = Address::generate(&env);
    let org_hash = dummy_hash(&env, 1);
    let treasury_hash = dummy_hash(&env, 2);

    client.initialize(
        &admin,
        &usdc_token,
        &org_hash,
        &treasury_hash,
        &employee_registry,
        &payroll_engine,
        &milestone_engine,
    );

    let result = client.try_initialize(
        &admin,
        &usdc_token,
        &org_hash,
        &treasury_hash,
        &employee_registry,
        &payroll_engine,
        &milestone_engine,
    );
    assert_eq!(result, Err(Ok(WorkforceError::AlreadyInitialized)));
}

#[test]
fn get_organization_errors_when_not_found() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, ..) = setup(&env);

    let result = client.try_get_organization(&999);
    assert_eq!(result, Err(Ok(WorkforceError::OrgNotFound)));
}

#[test]
fn update_wasm_hash_requires_admin_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, usdc_token) = setup(&env);
    let employee_registry = Address::generate(&env);
    let payroll_engine = Address::generate(&env);
    let milestone_engine = Address::generate(&env);
    client.initialize(
        &admin,
        &usdc_token,
        &dummy_hash(&env, 1),
        &dummy_hash(&env, 2),
        &employee_registry,
        &payroll_engine,
        &milestone_engine,
    );

    let new_hash = dummy_hash(&env, 9);
    client.update_wasm_hash(&Symbol::new(&env, "organization"), &new_hash);

    // Only the stored Admin's auth was invoked — verify it was required by
    // checking the authorized-call trace mentions the admin address.
    let auths = env.auths();
    assert!(auths.iter().any(|(addr, _)| addr == &admin));
}

#[test]
#[should_panic(expected = "invalid wasm hash target")]
fn update_wasm_hash_rejects_unknown_target() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, usdc_token) = setup(&env);
    let employee_registry = Address::generate(&env);
    let payroll_engine = Address::generate(&env);
    let milestone_engine = Address::generate(&env);
    client.initialize(
        &admin,
        &usdc_token,
        &dummy_hash(&env, 1),
        &dummy_hash(&env, 2),
        &employee_registry,
        &payroll_engine,
        &milestone_engine,
    );

    client.update_wasm_hash(
        &Symbol::new(&env, "not_a_real_target"),
        &dummy_hash(&env, 9),
    );
}
