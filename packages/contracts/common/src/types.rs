use soroban_sdk::{contracttype, Address};

/// Per-org deployed-contract addresses (docs/SMART_CONTRACT_SPECIFICATION.md
/// §1). Lives in `common` (not `payroll_factory`) so other contracts can use
/// this type in a `#[contractclient]` cross-contract call without depending
/// on the real `payroll_factory` crate — see `common::clients` doc comment.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OrgRecord {
    pub organization: Address,
    pub treasury: Address,
    pub owner: Address,
}

/// docs/SMART_CONTRACT_SPECIFICATION.md §4. Lives in `common` (not
/// `employee_registry`) for the same cross-contract-client reason as
/// `OrgRecord` — `payroll_engine` needs this shape to decode
/// `employee_registry.get_employee` without depending on the real
/// `employee_registry` crate.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PayFrequency {
    Weekly,
    BiWeekly,
    Monthly,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EmployeeRecord {
    pub wallet: Address,
    pub salary: i128,
    pub currency: Address,
    pub frequency: PayFrequency,
    pub active: bool,
}
