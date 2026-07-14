#![no_std]

use common::{
    clients::{
        employee_registry::EmployeeRegistryClient, organization::OrganizationClient,
        payroll_factory::PayrollFactoryClient, treasury::TreasuryClient,
    },
    events::payroll_engine as events,
    keys::{executed_run_key, org_record_cache_key, DataKey},
    OrgRecord, Role, WorkforceError,
};
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PayrollResult {
    pub succeeded: Vec<u64>,
    pub failed: Vec<(u64, Symbol)>,
}

#[contract]
pub struct PayrollEngine;

#[contractimpl]
impl PayrollEngine {
    pub fn initialize(
        env: Env,
        factory: Address,
        employee_registry: Address,
    ) -> Result<(), WorkforceError> {
        if env.storage().instance().has(&DataKey::PayrollFactory) {
            return Err(WorkforceError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&DataKey::PayrollFactory, &factory);
        env.storage()
            .instance()
            .set(&DataKey::EmployeeRegistry, &employee_registry);
        Ok(())
    }

    pub fn run_payroll(
        env: Env,
        authorizer: Address,
        org_id: u64,
        run_id: u64,
        employee_ids: Vec<u64>,
    ) -> Result<PayrollResult, WorkforceError> {
        authorizer.require_auth();

        let run_key = executed_run_key(org_id, run_id);
        if env.storage().persistent().get(&run_key).unwrap_or(false) {
            return Err(WorkforceError::RunAlreadyExecuted);
        }
        if employee_ids.is_empty() {
            return Err(WorkforceError::EmptyBatch);
        }

        let org_record = Self::resolve_org_record(&env, org_id)?;
        if !OrganizationClient::new(&env, &org_record.organization)
            .require_role(&authorizer, &Role::Finance)
        {
            return Err(WorkforceError::NotAuthorized);
        }

        // Marked executed *before* processing items: a fully-reverted
        // transaction (e.g. ran out of resources mid-batch) reverts this
        // write too, so it stays safely retryable with the same run_id;
        // a transaction that completes — even with per-item failures —
        // can never replay this run_id (docs/SMART_CONTRACT_SPECIFICATION.md
        // §5 Security considerations).
        env.storage().persistent().set(&run_key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&run_key, 0, env.storage().max_ttl());

        events::PayrollRunStarted {
            org_id,
            run_id,
            item_count: employee_ids.len(),
        }
        .publish(&env);

        let employee_registry: Address = env
            .storage()
            .instance()
            .get(&DataKey::EmployeeRegistry)
            .unwrap();

        let mut succeeded = Vec::new(&env);
        let mut failed = Vec::new(&env);
        for employee_id in employee_ids.iter() {
            match Self::pay_single_employee(
                &env,
                &org_record,
                &employee_registry,
                &authorizer,
                org_id,
                employee_id,
            ) {
                Ok(amount) => {
                    succeeded.push_back(employee_id);
                    events::PayrollItemPaid {
                        org_id,
                        run_id,
                        employee_id,
                        amount,
                    }
                    .publish(&env);
                }
                Err(reason) => {
                    failed.push_back((employee_id, reason.clone()));
                    events::PayrollItemFailed {
                        org_id,
                        run_id,
                        employee_id,
                        reason,
                    }
                    .publish(&env);
                }
            }
        }

        events::PayrollRunCompleted {
            org_id,
            run_id,
            succeeded: succeeded.len(),
            failed: failed.len(),
        }
        .publish(&env);

        Ok(PayrollResult { succeeded, failed })
    }

    /// Isolates one transfer attempt so a failure (inactive/missing
    /// employee, or the transfer itself failing) doesn't abort the batch.
    fn pay_single_employee(
        env: &Env,
        org_record: &OrgRecord,
        employee_registry: &Address,
        authorizer: &Address,
        org_id: u64,
        employee_id: u64,
    ) -> Result<i128, Symbol> {
        let record = match EmployeeRegistryClient::new(env, employee_registry)
            .try_get_employee(&org_id, &employee_id)
        {
            Ok(Ok(record)) => record,
            _ => return Err(Symbol::new(env, "employee_not_found")),
        };
        if !record.active {
            return Err(Symbol::new(env, "employee_inactive"));
        }

        let result = TreasuryClient::new(env, &org_record.treasury).try_transfer_out(
            &env.current_contract_address(),
            authorizer,
            &record.wallet,
            &record.salary,
            &Symbol::new(env, "payroll"),
        );
        match result {
            Ok(Ok(())) => Ok(record.salary),
            _ => Err(Symbol::new(env, "transfer_failed")),
        }
    }

    fn resolve_org_record(env: &Env, org_id: u64) -> Result<OrgRecord, WorkforceError> {
        let cache_key = org_record_cache_key(org_id);
        if let Some(record) = env.storage().persistent().get(&cache_key) {
            env.storage()
                .persistent()
                .extend_ttl(&cache_key, 0, env.storage().max_ttl());
            return Ok(record);
        }

        let factory: Address = env
            .storage()
            .instance()
            .get(&DataKey::PayrollFactory)
            .unwrap();
        let record = match PayrollFactoryClient::new(env, &factory).try_get_organization(&org_id) {
            Ok(Ok(record)) => record,
            _ => return Err(WorkforceError::OrgNotFound),
        };

        env.storage().persistent().set(&cache_key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&cache_key, 0, env.storage().max_ttl());
        Ok(record)
    }
}

#[cfg(test)]
mod test;
