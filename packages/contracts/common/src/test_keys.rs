use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::keys::{
    authorized_spender_key, employee_count_key, employee_key, escrow_balance_key, executed_run_key,
    member_role_key, milestone_count_key, milestone_key, org_address_key, org_registry_key,
    DataKey,
};

#[test]
fn key_builders_are_deterministic() {
    assert_eq!(employee_key(1, 2), employee_key(1, 2));
    assert_eq!(employee_count_key(1), employee_count_key(1));
    assert_eq!(org_registry_key(7), org_registry_key(7));
    assert_eq!(executed_run_key(1, 2), executed_run_key(1, 2));
    assert_eq!(milestone_key(1, 2), milestone_key(1, 2));
    assert_eq!(milestone_count_key(1), milestone_count_key(1));
    assert_eq!(escrow_balance_key(1), escrow_balance_key(1));
    assert_eq!(org_address_key(1), org_address_key(1));
    assert_ne!(org_address_key(1), org_address_key(2));
}

#[test]
fn key_builders_distinguish_different_inputs() {
    assert_ne!(employee_key(1, 2), employee_key(1, 3));
    assert_ne!(employee_key(1, 2), employee_key(2, 2));
    assert_ne!(employee_key(1, 2), DataKey::Milestone(1, 2));
    assert_ne!(org_registry_key(1), org_registry_key(2));
    assert_ne!(executed_run_key(1, 2), executed_run_key(1, 3));
    assert_ne!(milestone_count_key(1), escrow_balance_key(1));
}

#[test]
fn address_keyed_builders_are_deterministic_and_address_scoped() {
    let env = Env::default();
    let a = Address::generate(&env);
    let b = Address::generate(&env);

    assert_eq!(member_role_key(&a), member_role_key(&a));
    assert_ne!(member_role_key(&a), member_role_key(&b));
    assert_eq!(authorized_spender_key(&a), authorized_spender_key(&a));
    assert_ne!(authorized_spender_key(&a), authorized_spender_key(&b));
    assert_ne!(member_role_key(&a), authorized_spender_key(&a));
}
