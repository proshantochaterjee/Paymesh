use common::{Role, WorkforceError};
use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::{Organization, OrganizationClient};

fn setup(env: &Env) -> (OrganizationClient<'_>, Address) {
    let owner = Address::generate(env);
    let treasury = Address::generate(env);
    let employee_registry = Address::generate(env);
    let payroll_engine = Address::generate(env);
    let milestone_engine = Address::generate(env);

    let contract_id = env.register(
        Organization,
        (
            1u64,
            owner.clone(),
            treasury,
            employee_registry,
            payroll_engine,
            milestone_engine,
        ),
    );
    (OrganizationClient::new(env, &contract_id), owner)
}

#[test]
fn constructor_grants_owner_role() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, owner) = setup(&env);

    assert_eq!(client.get_role(&owner), Some(Role::Owner));
}

#[test]
fn owner_can_grant_and_admin_cannot_grant_owner() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, owner) = setup(&env);

    let admin = Address::generate(&env);
    client.grant_role(&owner, &admin, &Role::Admin);
    assert_eq!(client.get_role(&admin), Some(Role::Admin));

    let another = Address::generate(&env);
    let result = client.try_grant_role(&admin, &another, &Role::Owner);
    assert_eq!(result, Err(Ok(WorkforceError::NotAuthorized)));
}

#[test]
fn finance_and_hr_cannot_grant_roles() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, owner) = setup(&env);

    let finance = Address::generate(&env);
    client.grant_role(&owner, &finance, &Role::Finance);

    let target = Address::generate(&env);
    let result = client.try_grant_role(&finance, &target, &Role::Viewer);
    assert_eq!(result, Err(Ok(WorkforceError::NotAuthorized)));
}

#[test]
fn grant_role_rejects_caller_with_no_role() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _owner) = setup(&env);

    let stranger = Address::generate(&env);
    let target = Address::generate(&env);
    let result = client.try_grant_role(&stranger, &target, &Role::Viewer);
    assert_eq!(result, Err(Ok(WorkforceError::NotAuthorized)));
}

#[test]
fn revoke_role_by_admin_succeeds_and_last_owner_is_protected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, owner) = setup(&env);

    let member = Address::generate(&env);
    client.grant_role(&owner, &member, &Role::Hr);
    client.revoke_role(&owner, &member);
    assert_eq!(client.get_role(&member), None);

    // Only one Owner exists — revoking them must be rejected.
    let result = client.try_revoke_role(&owner, &owner);
    assert_eq!(result, Err(Ok(WorkforceError::CannotRevokeLastOwner)));
}

#[test]
fn revoking_an_owner_succeeds_when_another_owner_remains() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, owner) = setup(&env);

    let second_owner = Address::generate(&env);
    client.grant_role(&owner, &second_owner, &Role::Owner);

    client.revoke_role(&owner, &second_owner);
    assert_eq!(client.get_role(&second_owner), None);

    // Now only `owner` remains — they are protected again.
    let result = client.try_revoke_role(&owner, &owner);
    assert_eq!(result, Err(Ok(WorkforceError::CannotRevokeLastOwner)));
}

#[test]
fn self_demotion_of_last_owner_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, owner) = setup(&env);

    // grant_role used to change an existing member's role (self-demotion),
    // not just to add a brand-new member — docs/PERMISSION_MODEL.md §5.
    let result = client.try_grant_role(&owner, &owner, &Role::Admin);
    assert_eq!(result, Err(Ok(WorkforceError::CannotRevokeLastOwner)));
}

#[test]
fn revoke_role_errors_when_member_has_no_role() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, owner) = setup(&env);

    let stranger = Address::generate(&env);
    let result = client.try_revoke_role(&owner, &stranger);
    assert_eq!(result, Err(Ok(WorkforceError::RoleNotFound)));
}

#[test]
fn require_role_matches_has_at_least_semantics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, owner) = setup(&env);

    let finance = Address::generate(&env);
    client.grant_role(&owner, &finance, &Role::Finance);

    assert!(client.require_role(&finance, &Role::Finance));
    assert!(client.require_role(&finance, &Role::Viewer));
    assert!(!client.require_role(&finance, &Role::Hr));
    assert!(!client.require_role(&finance, &Role::Admin));

    let stranger = Address::generate(&env);
    assert!(!client.require_role(&stranger, &Role::Viewer));
}

#[test]
fn engine_setters_are_owner_only() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, owner) = setup(&env);

    let admin = Address::generate(&env);
    client.grant_role(&owner, &admin, &Role::Admin);

    let new_payroll_engine = Address::generate(&env);
    let result = client.try_set_payroll_engine(&admin, &new_payroll_engine);
    assert_eq!(result, Err(Ok(WorkforceError::NotAuthorized)));

    // Owner succeeds.
    client.set_payroll_engine(&owner, &new_payroll_engine);
    client.set_milestone_engine(&owner, &Address::generate(&env));
    client.set_employee_registry(&owner, &Address::generate(&env));
}

#[test]
fn update_metadata_hash_allows_owner_and_admin_but_not_finance() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, owner) = setup(&env);

    let admin = Address::generate(&env);
    client.grant_role(&owner, &admin, &Role::Admin);
    let finance = Address::generate(&env);
    client.grant_role(&owner, &finance, &Role::Finance);

    let hash_a = soroban_sdk::BytesN::from_array(&env, &[1u8; 32]);
    let hash_b = soroban_sdk::BytesN::from_array(&env, &[2u8; 32]);
    client.update_metadata_hash(&owner, &hash_a);
    client.update_metadata_hash(&admin, &hash_b);

    let result = client.try_update_metadata_hash(&finance, &hash_a);
    assert_eq!(result, Err(Ok(WorkforceError::NotAuthorized)));
}
