use soroban_sdk::{contractevent, Address, BytesN, Symbol};

use crate::role::Role;

/// One typed event struct per event documented in each contract's
/// "Events" section of docs/SMART_CONTRACT_SPECIFICATION.md, defined with
/// `#[contractevent]` (the entity ID(s) marked `#[topic]` so the indexer
/// can filter shared-singleton contracts' events, e.g. `employee_registry`,
/// per org — docs/EVENT_INDEXING.md). Each struct's fixed leading topic is
/// its name in lower snake case, matching the documented event name
/// byte-for-byte. Contracts call `SomeEvent { .. }.publish(&env)`.
pub mod payroll_factory {
    use super::*;

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct OrgCreated {
        #[topic]
        pub org_id: u64,
        pub organization: Address,
        pub treasury: Address,
        pub owner: Address,
    }

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct WasmHashUpdated {
        #[topic]
        pub target: Symbol,
        pub new_hash: BytesN<32>,
    }
}

pub mod organization {
    use super::*;

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct RoleGranted {
        #[topic]
        pub member: Address,
        pub role: Role,
    }

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct RoleRevoked {
        #[topic]
        pub member: Address,
    }

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct EngineUpdated {
        #[topic]
        pub target: Symbol,
        pub new_address: Address,
    }

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct MetadataUpdated {
        pub new_hash: BytesN<32>,
    }
}

pub mod treasury {
    use super::*;

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct Deposited {
        #[topic]
        pub org_id: u64,
        pub from: Address,
        pub amount: i128,
    }

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct Withdrawn {
        #[topic]
        pub org_id: u64,
        pub to: Address,
        pub amount: i128,
        pub authorized_by: Address,
    }

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct TransferredOut {
        #[topic]
        pub org_id: u64,
        #[topic]
        pub reason: Symbol,
        pub spender: Address,
        pub to: Address,
        pub amount: i128,
    }
}

pub mod employee_registry {
    use super::*;

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct EmployeeRegistered {
        #[topic]
        pub org_id: u64,
        #[topic]
        pub employee_id: u64,
        pub wallet: Address,
    }

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct EmployeeUpdated {
        #[topic]
        pub org_id: u64,
        #[topic]
        pub employee_id: u64,
    }

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct EmployeeDeactivated {
        #[topic]
        pub org_id: u64,
        #[topic]
        pub employee_id: u64,
    }
}

pub mod payroll_engine {
    use super::*;

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct PayrollRunStarted {
        #[topic]
        pub org_id: u64,
        #[topic]
        pub run_id: u64,
        pub item_count: u32,
    }

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct PayrollItemPaid {
        #[topic]
        pub org_id: u64,
        #[topic]
        pub run_id: u64,
        pub employee_id: u64,
        pub amount: i128,
    }

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct PayrollItemFailed {
        #[topic]
        pub org_id: u64,
        #[topic]
        pub run_id: u64,
        pub employee_id: u64,
        pub reason: Symbol,
    }

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct PayrollRunCompleted {
        #[topic]
        pub org_id: u64,
        #[topic]
        pub run_id: u64,
        pub succeeded: u32,
        pub failed: u32,
    }
}

pub mod milestone_engine {
    use super::*;

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct MilestoneCreated {
        #[topic]
        pub org_id: u64,
        #[topic]
        pub milestone_id: u64,
        pub contractor: Address,
        pub amount: i128,
    }

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct MilestoneFunded {
        #[topic]
        pub org_id: u64,
        #[topic]
        pub milestone_id: u64,
    }

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct MilestoneApproved {
        #[topic]
        pub org_id: u64,
        #[topic]
        pub milestone_id: u64,
        pub approver: Address,
    }

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct MilestoneReleased {
        #[topic]
        pub org_id: u64,
        #[topic]
        pub milestone_id: u64,
        pub contractor: Address,
        pub amount: i128,
    }

    #[contractevent]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct MilestoneCancelled {
        #[topic]
        pub org_id: u64,
        #[topic]
        pub milestone_id: u64,
        pub refunded: bool,
    }
}
