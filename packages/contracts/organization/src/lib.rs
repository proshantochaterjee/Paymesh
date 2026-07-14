#![no_std]

use common::{
    events::organization as events,
    keys::{member_role_key, DataKey},
    Role, WorkforceError,
};
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, Symbol};

#[contract]
pub struct Organization;

#[contractimpl]
impl Organization {
    // Invoked automatically and atomically by payroll_factory's deploy_v2
    // call (docs/SMART_CONTRACT_SPECIFICATION.md §1, §2) — the Soroban
    // constructor mechanism replaces a separate post-deploy `initialize`
    // call.
    #[allow(clippy::too_many_arguments)]
    pub fn __constructor(
        env: Env,
        org_id: u64,
        owner: Address,
        treasury: Address,
        employee_registry: Address,
        payroll_engine: Address,
        milestone_engine: Address,
    ) {
        let storage = env.storage().instance();
        storage.set(&DataKey::OrgId, &org_id);
        storage.set(&DataKey::TreasuryAddress, &treasury);
        storage.set(&DataKey::EmployeeRegistry, &employee_registry);
        storage.set(&DataKey::PayrollEngine, &payroll_engine);
        storage.set(&DataKey::MilestoneEngine, &milestone_engine);
        storage.set(&DataKey::OwnerCount, &1u32);

        let role_key = member_role_key(&owner);
        env.storage().persistent().set(&role_key, &Role::Owner);
        env.storage()
            .persistent()
            .extend_ttl(&role_key, 0, env.storage().max_ttl());

        events::RoleGranted {
            member: owner,
            role: Role::Owner,
        }
        .publish(&env);
    }

    pub fn grant_role(
        env: Env,
        caller: Address,
        member: Address,
        role: Role,
    ) -> Result<(), WorkforceError> {
        caller.require_auth();
        let caller_role = Self::role_of(&env, &caller).ok_or(WorkforceError::NotAuthorized)?;
        if !caller_role.has_at_least(&Role::Admin) {
            return Err(WorkforceError::NotAuthorized);
        }
        // Admin cannot grant Owner (docs/SMART_CONTRACT_SPECIFICATION.md §2).
        if matches!(role, Role::Owner) && !matches!(caller_role, Role::Owner) {
            return Err(WorkforceError::NotAuthorized);
        }

        let was_owner = matches!(Self::role_of(&env, &member), Some(Role::Owner));
        let becomes_owner = matches!(role, Role::Owner);

        // Covers self-/admin-demotion of the last Owner to a lesser role
        // (docs/PERMISSION_MODEL.md §5), not just an explicit revoke.
        if was_owner && !becomes_owner && Self::owner_count(&env) <= 1 {
            return Err(WorkforceError::CannotRevokeLastOwner);
        }

        if becomes_owner && !was_owner {
            Self::set_owner_count(&env, Self::owner_count(&env) + 1);
        } else if was_owner && !becomes_owner {
            Self::set_owner_count(&env, Self::owner_count(&env) - 1);
        }

        let key = member_role_key(&member);
        env.storage().persistent().set(&key, &role);
        env.storage()
            .persistent()
            .extend_ttl(&key, 0, env.storage().max_ttl());

        events::RoleGranted { member, role }.publish(&env);
        Ok(())
    }

    pub fn revoke_role(env: Env, caller: Address, member: Address) -> Result<(), WorkforceError> {
        caller.require_auth();
        let caller_role = Self::role_of(&env, &caller).ok_or(WorkforceError::NotAuthorized)?;
        if !caller_role.has_at_least(&Role::Admin) {
            return Err(WorkforceError::NotAuthorized);
        }

        let member_role = Self::role_of(&env, &member).ok_or(WorkforceError::RoleNotFound)?;
        if matches!(member_role, Role::Owner) {
            if Self::owner_count(&env) <= 1 {
                return Err(WorkforceError::CannotRevokeLastOwner);
            }
            Self::set_owner_count(&env, Self::owner_count(&env) - 1);
        }

        env.storage().persistent().remove(&member_role_key(&member));
        events::RoleRevoked { member }.publish(&env);
        Ok(())
    }

    pub fn get_role(env: Env, member: Address) -> Option<Role> {
        Self::role_of(&env, &member)
    }

    /// Read-only; returns bool rather than panicking so cross-contract
    /// callers (treasury, payroll_engine, milestone_engine) decide how to
    /// handle an insufficient role themselves.
    pub fn require_role(env: Env, member: Address, minimum: Role) -> bool {
        match Self::role_of(&env, &member) {
            Some(role) => role.has_at_least(&minimum),
            None => false,
        }
    }

    pub fn set_payroll_engine(
        env: Env,
        caller: Address,
        new_address: Address,
    ) -> Result<(), WorkforceError> {
        Self::require_owner(&env, &caller)?;
        env.storage()
            .instance()
            .set(&DataKey::PayrollEngine, &new_address);
        events::EngineUpdated {
            target: Symbol::new(&env, "payroll_engine"),
            new_address,
        }
        .publish(&env);
        Ok(())
    }

    pub fn set_milestone_engine(
        env: Env,
        caller: Address,
        new_address: Address,
    ) -> Result<(), WorkforceError> {
        Self::require_owner(&env, &caller)?;
        env.storage()
            .instance()
            .set(&DataKey::MilestoneEngine, &new_address);
        events::EngineUpdated {
            target: Symbol::new(&env, "milestone_engine"),
            new_address,
        }
        .publish(&env);
        Ok(())
    }

    pub fn set_employee_registry(
        env: Env,
        caller: Address,
        new_address: Address,
    ) -> Result<(), WorkforceError> {
        Self::require_owner(&env, &caller)?;
        env.storage()
            .instance()
            .set(&DataKey::EmployeeRegistry, &new_address);
        events::EngineUpdated {
            target: Symbol::new(&env, "employee_registry"),
            new_address,
        }
        .publish(&env);
        Ok(())
    }

    pub fn update_metadata_hash(
        env: Env,
        caller: Address,
        new_hash: BytesN<32>,
    ) -> Result<(), WorkforceError> {
        caller.require_auth();
        let caller_role = Self::role_of(&env, &caller).ok_or(WorkforceError::NotAuthorized)?;
        if !caller_role.has_at_least(&Role::Admin) {
            return Err(WorkforceError::NotAuthorized);
        }
        env.storage()
            .instance()
            .set(&DataKey::MetadataHash, &new_hash);
        events::MetadataUpdated { new_hash }.publish(&env);
        Ok(())
    }

    fn role_of(env: &Env, member: &Address) -> Option<Role> {
        env.storage().persistent().get(&member_role_key(member))
    }

    fn require_owner(env: &Env, caller: &Address) -> Result<(), WorkforceError> {
        caller.require_auth();
        match Self::role_of(env, caller) {
            Some(Role::Owner) => Ok(()),
            _ => Err(WorkforceError::NotAuthorized),
        }
    }

    fn owner_count(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::OwnerCount)
            .unwrap_or(0)
    }

    fn set_owner_count(env: &Env, count: u32) {
        env.storage().instance().set(&DataKey::OwnerCount, &count);
    }
}

#[cfg(test)]
mod test;
