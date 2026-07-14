#![no_std]

use common::{
    clients::{
        organization::OrganizationClient, payroll_factory::PayrollFactoryClient,
        treasury::TreasuryClient,
    },
    events::milestone_engine as events,
    keys::{escrow_balance_key, milestone_count_key, milestone_key, org_record_cache_key, DataKey},
    OrgRecord, Role, WorkforceError,
};
use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, MuxedAddress, Symbol,
};

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MilestoneStatus {
    Draft,
    Funded,
    Approved,
    Released,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneRecord {
    pub contractor: Address,
    pub amount: i128,
    pub status: MilestoneStatus,
}

#[contract]
pub struct MilestoneEngine;

#[contractimpl]
impl MilestoneEngine {
    pub fn initialize(env: Env, factory: Address, token: Address) -> Result<(), WorkforceError> {
        if env.storage().instance().has(&DataKey::PayrollFactory) {
            return Err(WorkforceError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&DataKey::PayrollFactory, &factory);
        env.storage().instance().set(&DataKey::TokenAddress, &token);
        Ok(())
    }

    pub fn create_milestone(
        env: Env,
        caller: Address,
        org_id: u64,
        contractor: Address,
        amount: i128,
    ) -> Result<u64, WorkforceError> {
        caller.require_auth();
        let org_record = Self::resolve_org_record(&env, org_id)?;
        Self::assert_finance(&env, &org_record, &caller)?;

        let milestone_id = Self::next_milestone_id(&env, org_id);
        let key = milestone_key(org_id, milestone_id);
        let record = MilestoneRecord {
            contractor: contractor.clone(),
            amount,
            status: MilestoneStatus::Draft,
        };
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, 0, env.storage().max_ttl());

        events::MilestoneCreated {
            org_id,
            milestone_id,
            contractor,
            amount,
        }
        .publish(&env);
        Ok(milestone_id)
    }

    pub fn fund_milestone(
        env: Env,
        caller: Address,
        org_id: u64,
        milestone_id: u64,
    ) -> Result<(), WorkforceError> {
        caller.require_auth();
        let org_record = Self::resolve_org_record(&env, org_id)?;
        Self::assert_finance(&env, &org_record, &caller)?;

        let key = milestone_key(org_id, milestone_id);
        let mut record: MilestoneRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(WorkforceError::MilestoneNotFound)?;
        Self::assert_transition(&record.status, &MilestoneStatus::Draft)?;

        TreasuryClient::new(&env, &org_record.treasury).transfer_out(
            &env.current_contract_address(),
            &caller,
            &env.current_contract_address(),
            &record.amount,
            &Symbol::new(&env, "milestone_fund"),
        );

        record.status = MilestoneStatus::Funded;
        env.storage().persistent().set(&key, &record);
        Self::adjust_escrow(&env, org_id, record.amount);

        events::MilestoneFunded {
            org_id,
            milestone_id,
        }
        .publish(&env);
        Ok(())
    }

    pub fn approve_milestone(
        env: Env,
        caller: Address,
        org_id: u64,
        milestone_id: u64,
    ) -> Result<(), WorkforceError> {
        caller.require_auth();
        let org_record = Self::resolve_org_record(&env, org_id)?;
        Self::assert_finance(&env, &org_record, &caller)?;

        let key = milestone_key(org_id, milestone_id);
        let mut record: MilestoneRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(WorkforceError::MilestoneNotFound)?;
        Self::assert_transition(&record.status, &MilestoneStatus::Funded)?;

        record.status = MilestoneStatus::Approved;
        env.storage().persistent().set(&key, &record);

        events::MilestoneApproved {
            org_id,
            milestone_id,
            approver: caller,
        }
        .publish(&env);
        Ok(())
    }

    pub fn release_milestone(
        env: Env,
        caller: Address,
        org_id: u64,
        milestone_id: u64,
    ) -> Result<(), WorkforceError> {
        caller.require_auth();
        let org_record = Self::resolve_org_record(&env, org_id)?;
        Self::assert_finance(&env, &org_record, &caller)?;

        let key = milestone_key(org_id, milestone_id);
        let mut record: MilestoneRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(WorkforceError::MilestoneNotFound)?;
        Self::assert_transition(&record.status, &MilestoneStatus::Approved)?;

        Self::token_client(&env).transfer(
            &env.current_contract_address(),
            MuxedAddress::from(record.contractor.clone()),
            &record.amount,
        );

        record.status = MilestoneStatus::Released;
        env.storage().persistent().set(&key, &record);
        Self::adjust_escrow(&env, org_id, -record.amount);

        events::MilestoneReleased {
            org_id,
            milestone_id,
            contractor: record.contractor.clone(),
            amount: record.amount,
        }
        .publish(&env);
        Ok(())
    }

    pub fn cancel_milestone(
        env: Env,
        caller: Address,
        org_id: u64,
        milestone_id: u64,
    ) -> Result<(), WorkforceError> {
        caller.require_auth();
        let org_record = Self::resolve_org_record(&env, org_id)?;
        Self::assert_finance(&env, &org_record, &caller)?;

        let key = milestone_key(org_id, milestone_id);
        let mut record: MilestoneRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(WorkforceError::MilestoneNotFound)?;

        let refunded = match record.status {
            MilestoneStatus::Draft => false,
            MilestoneStatus::Funded => {
                // A direct token transfer, not `treasury.deposit` — Soroban's
                // implicit contract self-auth only recognizes the *immediate*
                // caller. `deposit` needs its `from` to be the direct caller
                // of the token contract's own transfer, but that would be
                // treasury (one hop from the token), not milestone_engine
                // (two hops back); milestone_engine must move its own held
                // funds itself, exactly like `release_milestone` does.
                Self::token_client(&env).transfer(
                    &env.current_contract_address(),
                    MuxedAddress::from(org_record.treasury.clone()),
                    &record.amount,
                );
                Self::adjust_escrow(&env, org_id, -record.amount);
                true
            }
            MilestoneStatus::Approved | MilestoneStatus::Released | MilestoneStatus::Cancelled => {
                return Err(WorkforceError::InvalidStateTransition);
            }
        };

        record.status = MilestoneStatus::Cancelled;
        env.storage().persistent().set(&key, &record);

        events::MilestoneCancelled {
            org_id,
            milestone_id,
            refunded,
        }
        .publish(&env);
        Ok(())
    }

    pub fn get_milestone(
        env: Env,
        org_id: u64,
        milestone_id: u64,
    ) -> Result<MilestoneRecord, WorkforceError> {
        env.storage()
            .persistent()
            .get(&milestone_key(org_id, milestone_id))
            .ok_or(WorkforceError::MilestoneNotFound)
    }

    fn assert_finance(
        env: &Env,
        org_record: &OrgRecord,
        caller: &Address,
    ) -> Result<(), WorkforceError> {
        if OrganizationClient::new(env, &org_record.organization)
            .require_role(caller, &Role::Finance)
        {
            Ok(())
        } else {
            Err(WorkforceError::NotAuthorized)
        }
    }

    /// Enforces the full transition graph in one place (docs/SMART_CONTRACT_SPECIFICATION.md
    /// §6 Security considerations): the only valid transitions this checks
    /// for are Draft->Funded, Funded->Approved, Approved->Released; `cancel_milestone`
    /// has its own bespoke branch below since Draft/Funded->Cancelled are
    /// each valid but behave differently (no-op vs. refund).
    fn assert_transition(
        current: &MilestoneStatus,
        expected: &MilestoneStatus,
    ) -> Result<(), WorkforceError> {
        if current == expected {
            Ok(())
        } else {
            Err(WorkforceError::InvalidStateTransition)
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

    fn adjust_escrow(env: &Env, org_id: u64, delta: i128) {
        let key = escrow_balance_key(org_id);
        let current: i128 = env.storage().instance().get(&key).unwrap_or(0);
        env.storage().instance().set(&key, &(current + delta));
    }

    fn next_milestone_id(env: &Env, org_id: u64) -> u64 {
        let key = milestone_count_key(org_id);
        let count: u64 = env.storage().instance().get(&key).unwrap_or(0);
        let next = count + 1;
        env.storage().instance().set(&key, &next);
        next
    }

    fn token_client(env: &Env) -> token::TokenClient<'_> {
        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenAddress)
            .unwrap();
        token::TokenClient::new(env, &token_address)
    }
}

#[cfg(test)]
mod test;
