#![no_std]

use common::{
    clients::{organization::OrganizationClient, payroll_factory::PayrollFactoryClient},
    events::employee_registry as events,
    keys::{employee_count_key, employee_key, org_address_key, DataKey},
    EmployeeRecord, PayFrequency, Role, WorkforceError,
};
use soroban_sdk::{contract, contractimpl, Address, Env, Vec};

#[contract]
pub struct EmployeeRegistry;

#[contractimpl]
impl EmployeeRegistry {
    pub fn initialize(env: Env, factory: Address) -> Result<(), WorkforceError> {
        if env.storage().instance().has(&DataKey::PayrollFactory) {
            return Err(WorkforceError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&DataKey::PayrollFactory, &factory);
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn register_employee(
        env: Env,
        caller: Address,
        org_id: u64,
        wallet: Address,
        salary: i128,
        currency: Address,
        frequency: PayFrequency,
    ) -> Result<u64, WorkforceError> {
        caller.require_auth();
        if salary <= 0 {
            return Err(WorkforceError::InvalidSalary);
        }
        Self::assert_hr(&env, org_id, &caller)?;

        let employee_id = Self::next_employee_id(&env, org_id);
        let record = EmployeeRecord {
            wallet: wallet.clone(),
            salary,
            currency,
            frequency,
            active: true,
        };
        env.storage()
            .persistent()
            .set(&employee_key(org_id, employee_id), &record);
        env.storage().persistent().extend_ttl(
            &employee_key(org_id, employee_id),
            0,
            env.storage().max_ttl(),
        );

        events::EmployeeRegistered {
            org_id,
            employee_id,
            wallet,
        }
        .publish(&env);
        Ok(employee_id)
    }

    pub fn update_employee(
        env: Env,
        caller: Address,
        org_id: u64,
        employee_id: u64,
        salary: i128,
        frequency: PayFrequency,
    ) -> Result<(), WorkforceError> {
        caller.require_auth();
        if salary <= 0 {
            return Err(WorkforceError::InvalidSalary);
        }
        Self::assert_hr(&env, org_id, &caller)?;

        let key = employee_key(org_id, employee_id);
        let mut record: EmployeeRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(WorkforceError::EmployeeNotFound)?;
        record.salary = salary;
        record.frequency = frequency;
        env.storage().persistent().set(&key, &record);

        events::EmployeeUpdated {
            org_id,
            employee_id,
        }
        .publish(&env);
        Ok(())
    }

    pub fn deactivate_employee(
        env: Env,
        caller: Address,
        org_id: u64,
        employee_id: u64,
    ) -> Result<(), WorkforceError> {
        caller.require_auth();
        Self::assert_hr(&env, org_id, &caller)?;

        let key = employee_key(org_id, employee_id);
        let mut record: EmployeeRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(WorkforceError::EmployeeNotFound)?;
        record.active = false;
        env.storage().persistent().set(&key, &record);

        events::EmployeeDeactivated {
            org_id,
            employee_id,
        }
        .publish(&env);
        Ok(())
    }

    pub fn get_employee(
        env: Env,
        org_id: u64,
        employee_id: u64,
    ) -> Result<EmployeeRecord, WorkforceError> {
        env.storage()
            .persistent()
            .get(&employee_key(org_id, employee_id))
            .ok_or(WorkforceError::EmployeeNotFound)
    }

    pub fn list_active_employee_ids(env: Env, org_id: u64) -> Vec<u64> {
        let count: u64 = env
            .storage()
            .instance()
            .get(&employee_count_key(org_id))
            .unwrap_or(0);

        let mut ids = Vec::new(&env);
        for employee_id in 1..=count {
            let record: Option<EmployeeRecord> = env
                .storage()
                .persistent()
                .get(&employee_key(org_id, employee_id));
            if let Some(record) = record {
                if record.active {
                    ids.push_back(employee_id);
                }
            }
        }
        ids
    }

    fn assert_hr(env: &Env, org_id: u64, caller: &Address) -> Result<(), WorkforceError> {
        let org_address = Self::resolve_organization_address(env, org_id)?;
        if OrganizationClient::new(env, &org_address).require_role(caller, &Role::Hr) {
            Ok(())
        } else {
            Err(WorkforceError::NotAuthorized)
        }
    }

    fn resolve_organization_address(env: &Env, org_id: u64) -> Result<Address, WorkforceError> {
        let cache_key = org_address_key(org_id);
        if let Some(address) = env.storage().persistent().get(&cache_key) {
            env.storage()
                .persistent()
                .extend_ttl(&cache_key, 0, env.storage().max_ttl());
            return Ok(address);
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

        env.storage()
            .persistent()
            .set(&cache_key, &record.organization);
        env.storage()
            .persistent()
            .extend_ttl(&cache_key, 0, env.storage().max_ttl());
        Ok(record.organization)
    }

    fn next_employee_id(env: &Env, org_id: u64) -> u64 {
        let key = employee_count_key(org_id);
        let count: u64 = env.storage().instance().get(&key).unwrap_or(0);
        let next = count + 1;
        env.storage().instance().set(&key, &next);
        next
    }
}

#[cfg(test)]
mod test;
