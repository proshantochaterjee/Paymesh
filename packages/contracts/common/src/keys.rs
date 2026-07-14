use soroban_sdk::{contracttype, Address};

/// Storage key builders shared across all six contracts, so key
/// construction is consistent and typo-proof
/// (docs/SMART_CONTRACT_SPECIFICATION.md "common"). Each contract's
/// storage is namespaced by Soroban at the contract-instance level, so
/// sharing one `DataKey` type across contracts (each using only its own
/// relevant variants) is safe.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    // payroll_factory
    Admin,
    OrgWasmHash,
    TreasuryWasmHash,
    UsdcTokenAddress,
    OrgCount,
    OrgRegistry(u64),

    // organization
    OrgId,
    TreasuryAddress,
    EmployeeRegistry,
    PayrollEngine,
    MilestoneEngine,
    MemberRole(Address),
    MetadataHash,
    // Not in the original documented storage layout: enforcing
    // E_CANNOT_REVOKE_LAST_OWNER requires knowing how many members
    // currently hold Owner, and Soroban storage has no way to enumerate
    // or count entries under a keyed variant like MemberRole(Address) —
    // so a maintained counter is the only workable mechanism, updated by
    // every grant_role/revoke_role call that changes a member into or out
    // of the Owner role. See docs/SMART_CONTRACT_SPECIFICATION.md §2.
    OwnerCount,

    // treasury
    OrganizationAddress,
    TokenAddress,
    AuthorizedSpender(Address),

    // employee_registry
    Employee(u64, u64),
    EmployeeCount(u64),
    // Not in the original documented storage layout: resolve_organization_address
    // needs the network-wide payroll_factory address plus a per-org cache
    // of its resolved organization contract address. See
    // docs/SMART_CONTRACT_SPECIFICATION.md §4.
    PayrollFactory,
    OrgAddress(u64),

    // payroll_engine
    ExecutedRun(u64, u64),
    // Not in the original documented storage layout, same reasoning as
    // employee_registry's PayrollFactory/OrgAddress above: run_payroll needs
    // both the org's organization contract (for the Finance role check) and
    // its treasury contract (to call transfer_out), and payroll_factory's
    // get_organization returns both in one OrgRecord — so they're cached
    // together per org_id rather than as two separate lookups/keys. See
    // docs/SMART_CONTRACT_SPECIFICATION.md §5.
    OrgRecordCache(u64),

    // milestone_engine
    Milestone(u64, u64),
    MilestoneCount(u64),
    EscrowBalance(u64),
}

pub fn org_registry_key(org_id: u64) -> DataKey {
    DataKey::OrgRegistry(org_id)
}

pub fn member_role_key(member: &Address) -> DataKey {
    DataKey::MemberRole(member.clone())
}

pub fn authorized_spender_key(spender: &Address) -> DataKey {
    DataKey::AuthorizedSpender(spender.clone())
}

pub fn employee_key(org_id: u64, employee_id: u64) -> DataKey {
    DataKey::Employee(org_id, employee_id)
}

pub fn employee_count_key(org_id: u64) -> DataKey {
    DataKey::EmployeeCount(org_id)
}

pub fn org_address_key(org_id: u64) -> DataKey {
    DataKey::OrgAddress(org_id)
}

pub fn executed_run_key(org_id: u64, run_id: u64) -> DataKey {
    DataKey::ExecutedRun(org_id, run_id)
}

pub fn org_record_cache_key(org_id: u64) -> DataKey {
    DataKey::OrgRecordCache(org_id)
}

pub fn milestone_key(org_id: u64, milestone_id: u64) -> DataKey {
    DataKey::Milestone(org_id, milestone_id)
}

pub fn milestone_count_key(org_id: u64) -> DataKey {
    DataKey::MilestoneCount(org_id)
}

pub fn escrow_balance_key(org_id: u64) -> DataKey {
    DataKey::EscrowBalance(org_id)
}
