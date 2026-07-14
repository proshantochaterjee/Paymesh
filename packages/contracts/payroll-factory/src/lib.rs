#![no_std]

use common::{
    events::payroll_factory as events, keys::org_registry_key, keys::DataKey, OrgRecord,
    WorkforceError,
};
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, Symbol};

#[contract]
pub struct PayrollFactory;

#[contractimpl]
impl PayrollFactory {
    // Mirrors the on-chain `initialize` interface documented in
    // docs/SMART_CONTRACT_SPECIFICATION.md §1 one-for-one; each parameter is
    // a distinct piece of required network config, not incidental API sprawl.
    #[allow(clippy::too_many_arguments)]
    pub fn initialize(
        env: Env,
        admin: Address,
        usdc_token: Address,
        org_wasm_hash: BytesN<32>,
        treasury_wasm_hash: BytesN<32>,
        employee_registry: Address,
        payroll_engine: Address,
        milestone_engine: Address,
    ) -> Result<(), WorkforceError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(WorkforceError::AlreadyInitialized);
        }
        admin.require_auth();

        let storage = env.storage().instance();
        storage.set(&DataKey::Admin, &admin);
        storage.set(&DataKey::UsdcTokenAddress, &usdc_token);
        storage.set(&DataKey::OrgWasmHash, &org_wasm_hash);
        storage.set(&DataKey::TreasuryWasmHash, &treasury_wasm_hash);
        storage.set(&DataKey::EmployeeRegistry, &employee_registry);
        storage.set(&DataKey::PayrollEngine, &payroll_engine);
        storage.set(&DataKey::MilestoneEngine, &milestone_engine);
        storage.set(&DataKey::OrgCount, &0u64);

        Ok(())
    }

    pub fn create_organization(env: Env, owner: Address, salt: BytesN<32>) -> u64 {
        owner.require_auth();

        let storage = env.storage().instance();
        let org_wasm_hash: BytesN<32> = storage.get(&DataKey::OrgWasmHash).unwrap();
        let treasury_wasm_hash: BytesN<32> = storage.get(&DataKey::TreasuryWasmHash).unwrap();
        let usdc_token: Address = storage.get(&DataKey::UsdcTokenAddress).unwrap();
        let employee_registry: Address = storage.get(&DataKey::EmployeeRegistry).unwrap();
        let payroll_engine: Address = storage.get(&DataKey::PayrollEngine).unwrap();
        let milestone_engine: Address = storage.get(&DataKey::MilestoneEngine).unwrap();

        let org_id = Self::next_org_id(&env);

        // The factory only exposes one caller-supplied `salt`, but must
        // deploy two distinct contracts (organization + treasury) from
        // itself; reusing one salt for both would derive the same address
        // twice and the second deploy would fail. Deriving a second salt by
        // hashing the caller's salt with a fixed distinguishing suffix keeps
        // both addresses deterministic from the caller's original input
        // while guaranteeing they never collide.
        let mut treasury_salt_input = soroban_sdk::Bytes::from_array(&env, &salt.to_array());
        treasury_salt_input.extend_from_array(b"treasury");
        let treasury_salt: BytesN<32> = env.crypto().sha256(&treasury_salt_input).to_bytes();

        let org_deployer = env.deployer().with_current_contract(salt);
        let treasury_deployer = env.deployer().with_current_contract(treasury_salt);

        // Both addresses are deterministic from (this contract, salt) and
        // knowable before either deploy call, so organization and treasury
        // can each be constructed with the other's real address — no
        // separate post-deploy initialize call is needed.
        let org_address = org_deployer.deployed_address();
        let treasury_address = treasury_deployer.deployed_address();

        treasury_deployer.deploy_v2(
            treasury_wasm_hash,
            (
                org_id,
                org_address.clone(),
                usdc_token,
                payroll_engine.clone(),
                milestone_engine.clone(),
            ),
        );

        org_deployer.deploy_v2(
            org_wasm_hash,
            (
                org_id,
                owner.clone(),
                treasury_address.clone(),
                employee_registry,
                payroll_engine,
                milestone_engine,
            ),
        );

        let record = OrgRecord {
            organization: org_address.clone(),
            treasury: treasury_address.clone(),
            owner: owner.clone(),
        };
        let key = org_registry_key(org_id);
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, 0, env.storage().max_ttl());

        events::OrgCreated {
            org_id,
            organization: org_address,
            treasury: treasury_address,
            owner,
        }
        .publish(&env);

        org_id
    }

    pub fn get_organization(env: Env, org_id: u64) -> Result<OrgRecord, WorkforceError> {
        env.storage()
            .persistent()
            .get(&org_registry_key(org_id))
            .ok_or(WorkforceError::OrgNotFound)
    }

    pub fn update_wasm_hash(
        env: Env,
        target: Symbol,
        new_hash: BytesN<32>,
    ) -> Result<(), WorkforceError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(WorkforceError::NotFactoryAdmin)?;
        admin.require_auth();

        if target == Symbol::new(&env, "organization") {
            env.storage()
                .instance()
                .set(&DataKey::OrgWasmHash, &new_hash);
        } else if target == Symbol::new(&env, "treasury") {
            env.storage()
                .instance()
                .set(&DataKey::TreasuryWasmHash, &new_hash);
        } else {
            // Not a documented business-rule error (docs/SMART_CONTRACT_SPECIFICATION.md
            // §1 Errors) — an unrecognized target is a caller/programmer
            // mistake (only "organization"/"treasury" are valid), not a
            // recoverable condition, so it panics rather than returning a
            // typed WorkforceError.
            panic!("invalid wasm hash target: expected \"organization\" or \"treasury\"");
        }

        events::WasmHashUpdated { target, new_hash }.publish(&env);

        Ok(())
    }

    fn next_org_id(env: &Env) -> u64 {
        let storage = env.storage().instance();
        let count: u64 = storage.get(&DataKey::OrgCount).unwrap_or(0);
        let next = count + 1;
        storage.set(&DataKey::OrgCount, &next);
        next
    }
}

#[cfg(test)]
mod test;
