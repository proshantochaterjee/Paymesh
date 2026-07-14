use soroban_sdk::contracterror;

/// Single, globally-unique error registry shared by all six deployed
/// contracts (docs/SMART_CONTRACT_SPECIFICATION.md "common"). Each contract
/// only returns its relevant subset, but a given failure mode (e.g. "caller
/// isn't authorized") always maps to the same numeric code everywhere it
/// occurs, so client-side error handling (docs/ERROR_HANDLING.md §4) never
/// has to disambiguate the same number meaning different things in
/// different contracts.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum WorkforceError {
    // payroll_factory
    NotFactoryAdmin = 1,
    OrgNotFound = 2,
    AlreadyInitialized = 3,

    // organization (also reused by employee_registry, payroll_engine,
    // milestone_engine wherever a caller lacks the required role)
    NotAuthorized = 4,
    RoleNotFound = 5,
    CannotRevokeLastOwner = 6,

    // treasury
    NotOrganization = 7,
    NotAuthorizedSpender = 8,
    InsufficientBalance = 9,
    InvalidAmount = 10,

    // employee_registry
    EmployeeNotFound = 11,
    InvalidSalary = 12,

    // payroll_engine
    RunAlreadyExecuted = 13,
    EmptyBatch = 14,

    // milestone_engine
    MilestoneNotFound = 15,
    InvalidStateTransition = 16,
}
