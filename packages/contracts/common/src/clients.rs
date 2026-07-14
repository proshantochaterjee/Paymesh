//! Lightweight cross-contract call clients, generated from a bare
//! `#[contractclient]` trait rather than by depending on the real contract
//! crate. Depending on another `#[contract]`/`#[contractimpl]` crate as a
//! regular (non-dev) dependency links its exported contract functions into
//! *this* crate's own compiled WASM too — Rust's `#[no_mangle]`-based export
//! mechanism (which soroban-sdk's macros use) can't be dead-code-eliminated
//! per final artifact. A `#[contractclient]` trait generates only a typed
//! client for the functions it declares, with no implementation linked in,
//! which is the standard Soroban pattern for one contract calling another.

pub mod organization {
    use soroban_sdk::{contractclient, Address, Env};

    use crate::role::Role;

    #[contractclient(name = "OrganizationClient")]
    pub trait OrganizationInterface {
        fn require_role(env: Env, member: Address, minimum: Role) -> bool;
    }
}

pub mod treasury {
    use soroban_sdk::{contractclient, Address, Env, Symbol};

    use crate::error::WorkforceError;

    #[contractclient(name = "TreasuryClient")]
    pub trait TreasuryInterface {
        #[allow(clippy::too_many_arguments)]
        fn transfer_out(
            env: Env,
            spender_context: Address,
            authorizer: Address,
            to: Address,
            amount: i128,
            reason: Symbol,
        ) -> Result<(), WorkforceError>;

        fn deposit(env: Env, from: Address, amount: i128) -> Result<(), WorkforceError>;
    }
}

pub mod payroll_factory {
    use soroban_sdk::{contractclient, Env};

    use crate::{error::WorkforceError, types::OrgRecord};

    #[contractclient(name = "PayrollFactoryClient")]
    pub trait PayrollFactoryInterface {
        fn get_organization(env: Env, org_id: u64) -> Result<OrgRecord, WorkforceError>;
    }
}

pub mod employee_registry {
    use soroban_sdk::{contractclient, Env};

    use crate::{error::WorkforceError, types::EmployeeRecord};

    #[contractclient(name = "EmployeeRegistryClient")]
    pub trait EmployeeRegistryInterface {
        fn get_employee(
            env: Env,
            org_id: u64,
            employee_id: u64,
        ) -> Result<EmployeeRecord, WorkforceError>;
    }
}
