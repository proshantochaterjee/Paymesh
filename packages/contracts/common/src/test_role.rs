use crate::role::Role;

#[test]
fn owner_satisfies_every_minimum() {
    assert!(Role::Owner.has_at_least(&Role::Owner));
    assert!(Role::Owner.has_at_least(&Role::Admin));
    assert!(Role::Owner.has_at_least(&Role::Finance));
    assert!(Role::Owner.has_at_least(&Role::Hr));
    assert!(Role::Owner.has_at_least(&Role::Viewer));
}

#[test]
fn admin_satisfies_everything_except_owner() {
    assert!(!Role::Admin.has_at_least(&Role::Owner));
    assert!(Role::Admin.has_at_least(&Role::Admin));
    assert!(Role::Admin.has_at_least(&Role::Finance));
    assert!(Role::Admin.has_at_least(&Role::Hr));
    assert!(Role::Admin.has_at_least(&Role::Viewer));
}

#[test]
fn finance_and_hr_are_incomparable() {
    assert!(!Role::Finance.has_at_least(&Role::Hr));
    assert!(!Role::Hr.has_at_least(&Role::Finance));
}

#[test]
fn finance_and_hr_satisfy_own_minimum_and_viewer_only() {
    assert!(Role::Finance.has_at_least(&Role::Finance));
    assert!(Role::Finance.has_at_least(&Role::Viewer));
    assert!(!Role::Finance.has_at_least(&Role::Admin));

    assert!(Role::Hr.has_at_least(&Role::Hr));
    assert!(Role::Hr.has_at_least(&Role::Viewer));
    assert!(!Role::Hr.has_at_least(&Role::Admin));
}

#[test]
fn viewer_satisfies_only_viewer() {
    assert!(Role::Viewer.has_at_least(&Role::Viewer));
    assert!(!Role::Viewer.has_at_least(&Role::Hr));
    assert!(!Role::Viewer.has_at_least(&Role::Finance));
    assert!(!Role::Viewer.has_at_least(&Role::Admin));
    assert!(!Role::Viewer.has_at_least(&Role::Owner));
}

#[test]
fn can_move_funds_matches_permission_model() {
    assert!(Role::Owner.can_move_funds());
    assert!(Role::Admin.can_move_funds());
    assert!(Role::Finance.can_move_funds());
    assert!(!Role::Hr.can_move_funds());
    assert!(!Role::Viewer.can_move_funds());
}
