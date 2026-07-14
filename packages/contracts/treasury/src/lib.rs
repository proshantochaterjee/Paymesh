#![no_std]

use common::{
    clients::organization::OrganizationClient,
    events::treasury as events,
    keys::{authorized_spender_key, DataKey},
    Role, WorkforceError,
};
use soroban_sdk::{contract, contractimpl, token, Address, Env, MuxedAddress, Symbol};

#[contract]
pub struct Treasury;

#[contractimpl]
impl Treasury {
    // Invoked automatically and atomically by payroll_factory's deploy_v2
    // call (docs/SMART_CONTRACT_SPECIFICATION.md §1, §3).
    pub fn __constructor(
        env: Env,
        org_id: u64,
        organization: Address,
        token: Address,
        payroll_engine: Address,
        milestone_engine: Address,
    ) {
        let storage = env.storage().instance();
        storage.set(&DataKey::OrgId, &org_id);
        storage.set(&DataKey::OrganizationAddress, &organization);
        storage.set(&DataKey::TokenAddress, &token);
        storage.set(&authorized_spender_key(&payroll_engine), &true);
        storage.set(&authorized_spender_key(&milestone_engine), &true);
    }

    /// Permissionless top-up — anyone may deposit into an org's treasury.
    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<(), WorkforceError> {
        from.require_auth();
        if amount <= 0 {
            return Err(WorkforceError::InvalidAmount);
        }

        Self::token_client(&env).transfer(
            &from,
            MuxedAddress::from(env.current_contract_address()),
            &amount,
        );

        let org_id: u64 = env.storage().instance().get(&DataKey::OrgId).unwrap();
        events::Deposited {
            org_id,
            from,
            amount,
        }
        .publish(&env);
        Ok(())
    }

    /// Manual escape-hatch withdrawal, gated to Admin/Owner via a
    /// cross-contract role check against this org's `organization` contract.
    pub fn withdraw(
        env: Env,
        caller: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), WorkforceError> {
        caller.require_auth();
        if amount <= 0 {
            return Err(WorkforceError::InvalidAmount);
        }

        let organization: Address = env
            .storage()
            .instance()
            .get(&DataKey::OrganizationAddress)
            .unwrap();
        if !OrganizationClient::new(&env, &organization).require_role(&caller, &Role::Admin) {
            return Err(WorkforceError::NotAuthorized);
        }

        let balance = Self::token_client(&env).balance(&env.current_contract_address());
        if balance < amount {
            return Err(WorkforceError::InsufficientBalance);
        }

        Self::token_client(&env).transfer(
            &env.current_contract_address(),
            MuxedAddress::from(to.clone()),
            &amount,
        );

        let org_id: u64 = env.storage().instance().get(&DataKey::OrgId).unwrap();
        events::Withdrawn {
            org_id,
            to,
            amount,
            authorized_by: caller,
        }
        .publish(&env);
        Ok(())
    }

    /// Callable only by a pre-registered spender contract (payroll_engine /
    /// milestone_engine), and only with a human `authorizer` who
    /// independently holds at least Finance on this org's `organization`
    /// contract — see docs/SMART_CONTRACT_SPECIFICATION.md §3 Security
    /// considerations for why `spender_context` alone is never trusted:
    /// `spender_context.require_auth()` is what actually proves the caller
    /// is genuinely that contract (Soroban lets a contract authenticate its
    /// own address without a human signature only when it is truly the
    /// invoking code), and the `AuthorizedSpender` allowlist restricts
    /// which contracts' business logic may even attempt this call.
    pub fn transfer_out(
        env: Env,
        spender_context: Address,
        authorizer: Address,
        to: Address,
        amount: i128,
        reason: Symbol,
    ) -> Result<(), WorkforceError> {
        spender_context.require_auth();
        Self::assert_authorized_spender(&env, &spender_context)?;

        authorizer.require_auth();
        let organization: Address = env
            .storage()
            .instance()
            .get(&DataKey::OrganizationAddress)
            .unwrap();
        if !OrganizationClient::new(&env, &organization).require_role(&authorizer, &Role::Finance) {
            return Err(WorkforceError::NotAuthorized);
        }

        if amount <= 0 {
            return Err(WorkforceError::InvalidAmount);
        }
        let balance = Self::token_client(&env).balance(&env.current_contract_address());
        if balance < amount {
            return Err(WorkforceError::InsufficientBalance);
        }

        Self::token_client(&env).transfer(
            &env.current_contract_address(),
            MuxedAddress::from(to.clone()),
            &amount,
        );

        let org_id: u64 = env.storage().instance().get(&DataKey::OrgId).unwrap();
        events::TransferredOut {
            org_id,
            reason,
            spender: spender_context,
            to,
            amount,
        }
        .publish(&env);
        Ok(())
    }

    pub fn get_balance(env: Env) -> i128 {
        Self::token_client(&env).balance(&env.current_contract_address())
    }

    fn assert_authorized_spender(env: &Env, caller: &Address) -> Result<(), WorkforceError> {
        let is_authorized: bool = env
            .storage()
            .instance()
            .get(&authorized_spender_key(caller))
            .unwrap_or(false);
        if is_authorized {
            Ok(())
        } else {
            Err(WorkforceError::NotAuthorizedSpender)
        }
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
