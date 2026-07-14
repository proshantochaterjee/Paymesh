# Smart Contract Specification

Language: Rust, `soroban-sdk`. Target: Stellar Testnet. All contracts share
the `common` library crate (not independently deployed) for error codes,
event topics, storage-key helpers, and the `Role` enum.

Contract-wide conventions:

- All public functions that change state require `Address.require_auth()`
  on the acting party before any storage mutation.
- All amounts are `i128`, denominated in the token's smallest unit (USDC
  SAC uses 7 decimal places, matching Stellar's standard asset precision).
- All contracts use instance storage for singleton config and persistent
  storage for per-entity records, with an explicit TTL-extension call
  (`extend_ttl`) invoked on every write to persistent entries so records
  don't expire out from under an active organization (Soroban state
  expiration).
- Every public function has a corresponding unit test asserting both the
  happy path and each documented error.

---

## common (shared library crate, not deployed)

### Purpose
Single source of truth for error codes, event topic constants, storage key
builders, and the `Role` enum, imported by all six deployed contracts so
their on-chain interfaces stay byte-for-byte consistent.

### Contents
- `pub enum WorkforceError` — the full error registry (see per-contract
  Errors sections below; each contract only uses its relevant subset, but
  numeric codes are globally unique across the whole system to make
  client-side error handling unambiguous).
- `pub enum Role { Owner, Admin, Finance, Hr, Viewer }` with
  `impl Role { fn can_move_funds(&self) -> bool }` etc. helper predicates.
- `pub mod events` — typed event-topic/data struct constructors used by
  `env.events().publish(...)` calls in every contract.
- `pub mod keys` — `DataKey` enum variants and helper functions
  (`fn employee_key(org_id: u64, employee_id: u64) -> DataKey`) to keep
  storage key construction consistent and typo-proof across contracts.

### Testing strategy
Pure unit tests on helper functions (key construction determinism, role
predicate correctness); no contract-level integration tests since this
crate is never deployed on its own.

---

## 1. payroll_factory

### Purpose
The single network-wide entry point for creating a new organization. Deploys
a matched `organization` + `treasury` contract pair per organization and
maintains the canonical org registry.

### Storage layout
| Key | Type | Description |
|---|---|---|
| `Admin` | `Address` | Factory admin (WorkforceOS deployer), can update WASM hashes |
| `OrgWasmHash` | `BytesN<32>` | Current `organization` contract WASM hash used for new deployments |
| `TreasuryWasmHash` | `BytesN<32>` | Current `treasury` contract WASM hash used for new deployments |
| `UsdcTokenAddress` | `Address` | USDC SAC address, passed through to every new `treasury` |
| `EmployeeRegistry` | `Address` | Shared singleton address, passed through to every new `organization` |
| `PayrollEngine` | `Address` | Shared singleton address, passed through to every new `organization`/`treasury` |
| `MilestoneEngine` | `Address` | Shared singleton address, passed through to every new `organization`/`treasury` |
| `OrgCount` | `u64` | Monotonic counter, source of new `org_id` values |
| `OrgRegistry(u64)` | `OrgRecord { organization: Address, treasury: Address, owner: Address }` | Per-org deployed-contract addresses |

### Events
- `org_created { org_id: u64, organization: Address, treasury: Address, owner: Address }`
- `wasm_hash_updated { target: Symbol ("organization" | "treasury"), new_hash: BytesN<32> }`

### Errors
- `E_NOT_FACTORY_ADMIN`
- `E_ORG_NOT_FOUND`
- `E_ALREADY_INITIALIZED`

### Public functions
- `initialize(admin: Address, usdc_token: Address, org_wasm_hash: BytesN<32>, treasury_wasm_hash: BytesN<32>, employee_registry: Address, payroll_engine: Address, milestone_engine: Address)` — one-time setup, callable once (`E_ALREADY_INITIALIZED` thereafter). The three shared-singleton addresses must already be deployed (see [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) Step 4's build/deploy order: singletons before the factory) since the factory has no other way to learn them and `organization.initialize` requires them for every new org.
- `create_organization(owner: Address, salt: BytesN<32>) -> u64` — requires `owner.require_auth()`; derives two distinct deployment salts from the caller's `salt` (so the same input can't collide the `organization` and `treasury` addresses), computes each contract's deterministic pre-deployment address via `deployer.deployed_address()`, then deploys both via `deployer.deploy_v2(wasm_hash, constructor_args)` — each contract's constructor runs its own `initialize` atomically at deploy time, so `organization` receives `treasury`'s address and vice versa without any separate post-deploy call. Writes `OrgRegistry`, emits `org_created`, returns `org_id`.
- `get_organization(org_id: u64) -> OrgRecord` — read-only, errors `E_ORG_NOT_FOUND` if absent.
- `update_wasm_hash(target: Symbol, new_hash: BytesN<32>)` — factory-admin only, affects future deployments only.

### Internal functions
- `next_org_id()` — increments and returns `OrgCount`.

### Access control
Only the stored `Admin` may call `update_wasm_hash`. Only the caller
claiming to be `owner` (verified via `require_auth`) may create an
organization under their own address — nobody can create an org "on behalf
of" another address.

### Security considerations
- `salt` must be caller-supplied and unique per deployment to produce
  deterministic, collision-free contract addresses; the factory does not
  reuse salts.
- The factory never gains any ongoing authority over a deployed org's
  treasury — `initialize` on the new `treasury` instance sets the org's
  `owner` as the treasury admin, not the factory.

### Gas considerations
Deploying two contract instances in one invocation is the most
resource-expensive call in the system; `create_organization` is expected
to be called rarely per organization (once), so this cost is acceptable
and not optimized further for MVP.

### Upgrade strategy
See [BLOCKCHAIN_ARCHITECTURE.md](./BLOCKCHAIN_ARCHITECTURE.md) §4. The
factory itself is also immutable once deployed; a factory-level bug
requires deploying `payroll_factory_v2` and updating the frontend/backend's
configured factory address — organizations already created are unaffected
since their contracts are independent, already-deployed instances.

### Testing strategy
Unit tests: initialize-once enforcement, unauthorized `create_organization`
rejected, successful creation produces retrievable `OrgRecord`, WASM hash
update only by admin, sequential org IDs are unique.

---

## 2. organization

### Purpose
Per-organization identity and role-authority contract. Every organization
gets its own instance, deployed by `payroll_factory`.

### Storage layout
| Key | Type | Description |
|---|---|---|
| `OrgId` | `u64` | Assigned by factory at init |
| `TreasuryAddress` | `Address` | This org's `treasury` instance |
| `EmployeeRegistry` | `Address` | Shared singleton address |
| `PayrollEngine` | `Address` | Shared singleton address |
| `MilestoneEngine` | `Address` | Shared singleton address |
| `Role(Address)` | `Role` | Role assignment per member address |
| `MetadataHash` | `BytesN<32>` | Hash of off-chain org profile (name, etc.) for tamper-evidence; the profile itself lives in Postgres |
| `OwnerCount` | `u32` | Number of members currently holding `Owner`, maintained by `grant_role`/`revoke_role` — Soroban storage can't enumerate or count entries under a keyed variant like `Role(Address)`, so a counter is the only workable way to detect "last owner" for `E_CANNOT_REVOKE_LAST_OWNER` |

### Events
- `role_granted { member: Address, role: Role }`
- `role_revoked { member: Address }`
- `engine_updated { target: Symbol, new_address: Address }`
- `metadata_updated { new_hash: BytesN<32> }`

### Errors
- `E_NOT_AUTHORIZED` (caller lacks required role)
- `E_ROLE_NOT_FOUND`
- `E_CANNOT_REVOKE_LAST_OWNER`

### Public functions
- `initialize(org_id: u64, owner: Address, treasury: Address, employee_registry: Address, payroll_engine: Address, milestone_engine: Address)` — implemented as the Soroban constructor (`__constructor`), invoked automatically and atomically by `payroll_factory`'s `deploy_v2` call (see §1); grants `owner` the `Owner` role and sets `OwnerCount = 1`.
- `grant_role(caller: Address, member: Address, role: Role)` — `caller` must hold `Owner` or `Admin`; `Admin` cannot grant `Owner`. Also enforces last-owner protection: if `member` currently holds `Owner` and `role` is not `Owner` (self- or admin-demotion, per [PERMISSION_MODEL.md](./PERMISSION_MODEL.md) §5), rejected with `E_CANNOT_REVOKE_LAST_OWNER` when `OwnerCount <= 1`. Updates `OwnerCount` whenever a member transitions into or out of `Owner`.
- `revoke_role(caller: Address, member: Address)` — same authority rule; rejects removing the last remaining `Owner` (`E_CANNOT_REVOKE_LAST_OWNER`, i.e. `OwnerCount <= 1`); decrements `OwnerCount` when the revoked member held `Owner`.
- `get_role(member: Address) -> Option<Role>` — read-only.
- `require_role(member: Address, minimum: Role)` — read-only helper other contracts call (via cross-contract call) to check authorization without duplicating role storage; returns bool, does not panic, so callers decide how to handle failure.
- `set_payroll_engine(caller: Address, new_address: Address)` / `set_milestone_engine(...)` / `set_employee_registry(...)` — `Owner`-only; the explicit, audited migration mechanism described in [BLOCKCHAIN_ARCHITECTURE.md](./BLOCKCHAIN_ARCHITECTURE.md) §4.
- `update_metadata_hash(caller: Address, new_hash: BytesN<32>)` — `Owner` or `Admin`.

### Internal functions
- `has_at_least(role: &Role, minimum: &Role) -> bool` — role-ordering check (`Owner > Admin > Finance == Hr > Viewer`, with `Finance`/`Hr` incomparable to each other by design — see [PERMISSION_MODEL.md](./PERMISSION_MODEL.md)).

### Access control
This contract **is** the access-control source of truth for its org.
`treasury`, `payroll_engine`, and `milestone_engine` all call back into
`organization.require_role(...)` (or an equivalent authorization check
propagated from it) before honoring a fund-moving request scoped to this
org, rather than maintaining their own duplicate role tables.

### Security considerations
- Only the org's own `organization` contract can authorize spending from
  its `treasury` — verified by `treasury` storing the `organization`
  address at init and only trusting role lookups from that exact address.
- Last-owner protection prevents an org from being permanently
  unadministrable.

### Gas considerations
Role checks are O(1) storage reads; no unbounded loops.

### Upgrade strategy
Immutable per instance; org migrates to a new `organization` WASM only by
the (out-of-MVP-scope) process of deploying a new instance and having
`payroll_factory`'s registry updated — not expected to be needed in the
MVP lifetime, documented here for completeness per the "upgrade-friendly"
requirement.

### Testing strategy
Unit tests: role grant/revoke authority boundaries, last-owner protection,
engine-address migration only by Owner, unauthorized calls rejected for
every mutating function.

---

## 3. treasury

### Purpose
Custodies one organization's USDC balance and is the only contract that
ever calls `transfer` on the USDC SAC token on an org's behalf.

### Storage layout
| Key | Type | Description |
|---|---|---|
| `OrgId` | `u64` | |
| `OrganizationAddress` | `Address` | This org's `organization` contract — the authorization source |
| `TokenAddress` | `Address` | USDC SAC address |
| `AuthorizedSpender(Address)` | `bool` | Set for exactly `payroll_engine` and `milestone_engine` addresses at init |

### Events
- `deposited { org_id: u64, from: Address, amount: i128 }`
- `withdrawn { org_id: u64, to: Address, amount: i128, authorized_by: Address }`
- `transferred_out { org_id: u64, spender: Address, to: Address, amount: i128, reason: Symbol }`

### Errors
- `E_NOT_ORGANIZATION` (caller isn't the linked `organization` contract, for admin-gated calls)
- `E_NOT_AUTHORIZED_SPENDER`
- `E_INSUFFICIENT_BALANCE`
- `E_INVALID_AMOUNT` (zero or negative)

### Public functions
- `initialize(org_id: u64, organization: Address, token: Address, payroll_engine: Address, milestone_engine: Address)` — called once by the factory at deployment; sets both engines as `AuthorizedSpender`.
- `deposit(from: Address, amount: i128)` — `from.require_auth()`; calls `token.transfer(from, treasury_contract_address, amount)`; anyone can deposit into an org's treasury (deposits are permissionless top-ups), emits `deposited`.
- `withdraw(caller: Address, to: Address, amount: i128)` — requires `caller.require_auth()` **and** `organization.require_role(caller, Role::Admin)` (cross-contract call); transfers from treasury to `to`; emits `withdrawn`. This is the manual "send funds back out without going through payroll/milestones" escape hatch, gated to Admin/Owner.
- `transfer_out(spender_context: Address, authorizer: Address, to: Address, amount: i128, reason: Symbol) -> ()` — callable only when `env.current_contract_address()`'s caller is a contract in `AuthorizedSpender`; additionally requires `authorizer.require_auth()` and `organization.require_role(authorizer, Role::Finance)` so a payroll/milestone call still carries a real human's authorization, not just "the engine said so." Emits `transferred_out`.
- `get_balance() -> i128` — read-only, calls `token.balance(treasury_contract_address)`.

### Internal functions
- `assert_authorized_spender(caller: &Address)` — checks `AuthorizedSpender` map, else `E_NOT_AUTHORIZED_SPENDER`.

### Access control
Two-layer: (1) the calling **contract** must be a pre-registered spender
(`payroll_engine`/`milestone_engine`), closing off any other contract from
even attempting a call; (2) the human **authorizer** passed into that call
must independently hold at least `Finance` role on the org's
`organization` contract, verified fresh on every call (no caching of role
state inside `treasury`).

### Security considerations
- `transfer_out` deliberately does not trust `spender_context` alone —
  Soroban does not give a contract a free, spoof-proof "who called me" the
  way EVM's `msg.sender` is sometimes assumed to be; the authorization
  actually enforced is the `authorizer.require_auth()` signature check
  combined with the org's own role table, which is the tamper-resistant
  part. The `AuthorizedSpender` allowlist is a defense-in-depth restriction
  on *which contracts' business logic* is allowed to originate a
  `transfer_out` call at all, not the sole authorization gate.
- Reentrancy: Soroban's storage model and the absence of fallback-style
  hooks on the token transfer make classic reentrancy inapplicable, but
  `transfer_out`/`withdraw` still follow checks-effects-interactions
  (balance/role checks before the token transfer call) as defensive
  practice.
- No function allows setting `AuthorizedSpender` after `initialize` — a
  fixed, audited allowlist for the life of the contract, consistent with
  the no-proxy-upgrade philosophy.

### Gas considerations
Each `transfer_out` is a single token transfer plus one cross-contract
role-check call — O(1), safe to call once per payroll item within a
`payroll_engine` batch loop.

### Upgrade strategy
Immutable; a new treasury implementation would require a new org (out of
MVP scope; existing orgs are not force-migrated).

### Testing strategy
Unit tests: deposit by anyone succeeds; withdraw rejected for non-Admin;
transfer_out rejected when caller contract isn't an authorized spender;
transfer_out rejected when authorizer lacks Finance role even if spender
contract is authorized; insufficient-balance rejection; balance reads
match token contract's ground truth after each operation.

---

## 4. employee_registry

### Purpose
Network-wide, multi-tenant record of the minimum data needed to authorize
paying an employee: wallet, salary, currency, frequency, active flag. PII
(name, personal email) is intentionally **not** stored here — see
[EMPLOYEE_MODEL.md](./EMPLOYEE_MODEL.md).

### Storage layout
| Key | Type | Description |
|---|---|---|
| `Employee(org_id: u64, employee_id: u64)` | `EmployeeRecord { wallet: Address, salary: i128, currency: Address, frequency: PayFrequency, active: bool }` | |
| `EmployeeCount(org_id: u64)` | `u64` | Per-org monotonic counter for `employee_id` |
| `PayrollFactory` | `Address` | Network-wide `payroll_factory` address, set once at deploy — the only way this registry can resolve an `org_id` to its `organization` contract address (see `resolve_organization_address` below) |
| `OrgAddress(org_id: u64)` | `Address` | Cached `organization` contract address for an org, populated on that org's first employee-registry operation |

`PayFrequency` enum: `Weekly, BiWeekly, Monthly`.

### Events
- `employee_registered { org_id: u64, employee_id: u64, wallet: Address }`
- `employee_updated { org_id: u64, employee_id: u64 }`
- `employee_deactivated { org_id: u64, employee_id: u64 }`

### Errors
- `E_NOT_AUTHORIZED` (caller isn't Admin/HR on the org)
- `E_EMPLOYEE_NOT_FOUND`
- `E_INVALID_SALARY` (zero or negative)
- `E_ALREADY_INITIALIZED` (shared with `payroll_factory`; this registry's own one-time `initialize` call)

### Public functions
- `initialize(factory: Address)` — one-time setup, callable once (`E_ALREADY_INITIALIZED` thereafter); deployed and initialized standalone like `payroll_factory` itself (this is a network-wide singleton, not deployed per-org), per [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).
- `register_employee(caller: Address, org_id: u64, wallet: Address, salary: i128, currency: Address, frequency: PayFrequency) -> u64` — requires `caller.require_auth()` and `organization(org_id).require_role(caller, Role::Hr)`; returns new `employee_id`.
- `update_employee(caller: Address, org_id: u64, employee_id: u64, salary: i128, frequency: PayFrequency)` — same authority.
- `deactivate_employee(caller: Address, org_id: u64, employee_id: u64)` — same authority; sets `active = false` (soft delete — payroll_engine skips inactive employees).
- `get_employee(org_id: u64, employee_id: u64) -> EmployeeRecord` — read-only.
- `list_active_employee_ids(org_id: u64) -> Vec<u64>` — read-only, used by `payroll_engine` to build a full-org run; bounded by the org's `EmployeeCount`, paginated by the caller for large orgs (see Gas considerations).

### Internal functions
- `resolve_organization_address(org_id: u64) -> Address` — reads `OrgAddress(org_id)` if already cached; otherwise cross-contract calls `payroll_factory.get_organization(org_id)` (using the stored `PayrollFactory` address), caches the result in `OrgAddress(org_id)`, and returns it — avoiding a cross-contract call to the factory on every registry operation after the first.

### Access control
Delegates entirely to the relevant org's `organization` contract role
table — `employee_registry` holds no role data of its own, eliminating any
chance of the two getting out of sync.

### Security considerations
- Cross-tenant isolation: every storage key and every authorization check
  is scoped by `org_id`; there is no function that reads or writes another
  org's employees, and this is asserted directly in tests by attempting
  cross-org access with valid credentials for the *wrong* org.

### Gas considerations
`list_active_employee_ids` returns a `Vec<u64>`, which is bounded by
practical organization size (hundreds, not millions); if an org's
headcount grows large enough to threaten the resource limit, the frontend
paginates the underlying employee list from Postgres (source of the
human-readable roster) and the contract call only needs the subset of IDs
in the current payroll batch — `payroll_engine.run_payroll` accepts an
explicit `employee_ids: Vec<u64>` rather than always pulling "all active
employees" on-chain, so batch size is caller-controlled.

### Upgrade strategy
Shared singleton; upgraded per
[BLOCKCHAIN_ARCHITECTURE.md](./BLOCKCHAIN_ARCHITECTURE.md) §4 (new
instance, orgs migrate their `organization.set_employee_registry` pointer
individually).

### Testing strategy
Unit tests: registration/update/deactivate authority boundaries per role,
cross-org isolation, inactive employees excluded from
`list_active_employee_ids`, invalid salary rejected.

---

## 5. payroll_engine

### Purpose
Executes a payroll run: pays a specified batch of an org's active
employees from that org's treasury, atomically per-item with documented
partial-failure semantics across the batch.

### Storage layout
| Key | Type | Description |
|---|---|---|
| `ExecutedRun(org_id: u64, run_id: u64)` | `bool` | Idempotency guard — a `run_id` can only be executed once |
| `PayrollFactory` | `Address` | Network-wide `payroll_factory` address, set once at deploy |
| `EmployeeRegistry` | `Address` | Network-wide `employee_registry` address, set once at deploy |
| `OrgRecordCache(org_id: u64)` | `OrgRecord` | Cached `organization`/`treasury` addresses for an org (both needed: the former for the Finance role check, the latter for `transfer_out`), populated on that org's first `run_payroll` call via `payroll_factory.get_organization` |

No balances are held here; this contract only orchestrates
`treasury.transfer_out` calls and records that a `run_id` has been
consumed.

### Events
- `payroll_run_started { org_id: u64, run_id: u64, item_count: u32 }`
- `payroll_item_paid { org_id: u64, run_id: u64, employee_id: u64, amount: i128 }`
- `payroll_item_failed { org_id: u64, run_id: u64, employee_id: u64, reason: Symbol }`
- `payroll_run_completed { org_id: u64, run_id: u64, succeeded: u32, failed: u32 }`

### Errors
- `E_RUN_ALREADY_EXECUTED`
- `E_EMPTY_BATCH`
- `E_NOT_AUTHORIZED` (authorizer lacks Finance role)
- `E_ALREADY_INITIALIZED` (shared with `payroll_factory`/`employee_registry`; this engine's own one-time `initialize` call)

### Public functions
- `initialize(factory: Address, employee_registry: Address)` — one-time setup, callable once (`E_ALREADY_INITIALIZED` thereafter); deployed and initialized standalone like `employee_registry`, per [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).
- `run_payroll(authorizer: Address, org_id: u64, run_id: u64, employee_ids: Vec<u64>) -> PayrollResult { succeeded: Vec<u64>, failed: Vec<(u64, Symbol)> }` — requires `authorizer.require_auth()` and `organization(org_id).require_role(authorizer, Role::Finance)`; rejects if `ExecutedRun(org_id, run_id)` already true (`E_RUN_ALREADY_EXECUTED`) or `employee_ids` is empty (`E_EMPTY_BATCH`); marks the run executed **before** processing items (so a mid-batch panic can't be retried into a double-pay — see Security considerations); for each `employee_id`, looks up the `employee_registry` record, skips and records-as-failed if inactive/not found, else calls `treasury.transfer_out(..., reason: "payroll")`, emitting `payroll_item_paid` or `payroll_item_failed` per item; emits `payroll_run_completed` at the end.

### Internal functions
- `pay_single_employee(org_id, employee_id, authorizer) -> Result<i128, Symbol>` — isolates one transfer attempt so a failure (e.g., registry lookup miss) doesn't abort the loop.

### Access control
Same two-layer pattern as `treasury`: this contract must be in
`treasury`'s `AuthorizedSpender` set, and the `authorizer` parameter must
independently hold `Finance` role on the org.

### Security considerations
- **Idempotency**: `ExecutedRun` is set *before* the payment loop runs
  (not after), so if the transaction runs out of resources mid-batch and
  the whole invocation reverts, Soroban's atomic-transaction semantics
  revert the `ExecutedRun` write too — meaning a fully-reverted transaction
  is safely retryable with the same `run_id`, while a transaction that
  *completes* (even with some per-item failures recorded in events) can
  never be replayed for the same `run_id`. This is the correct semantic:
  Soroban transactions are all-or-nothing at the top level regardless of
  where the flag is set; the flag's role is purely to reject a second
  `run_payroll` call with a `run_id` that already completed successfully.
- **Partial failure is a first-class, visible outcome**: an inactive
  employee or a registry-lookup miss inside a batch does not fail the
  whole transaction — it's recorded as a per-item failure event so
  Finance can see exactly who wasn't paid and why, and issue a follow-up
  run for just those employees with a new `run_id`.
- The backend never constructs a `run_id` from anything guessable/
  sequential-from-zero-per-org that a malicious actor could race; `run_id`
  is generated by the backend from the Postgres `PayrollRun.id` sequence
  scoped per org, and the contract's `ExecutedRun` check is the actual
  trust boundary regardless of how the ID was chosen.

### Gas considerations
Batch size is bounded by Soroban resource limits; see
[PAYROLL_ENGINE.md](./PAYROLL_ENGINE.md) §"Batching" for the concrete chunk
size the backend uses when an org's payroll run exceeds one transaction's
capacity, and how multiple chunks share one logical `PayrollRun` but use
distinct `run_id`s per chunk.

### Upgrade strategy
Shared singleton, migrated per-org via
`organization.set_payroll_engine`.

### Testing strategy
Unit tests: double-execution of the same `run_id` rejected, unauthorized
caller rejected, inactive employee produces a failure event not a
transaction abort, empty batch rejected, successful run's balance changes
match the sum of per-item amounts exactly.

---

## 6. milestone_engine

### Purpose
Escrow-based contractor payments: fund a milestone from an org's treasury,
require approval, then release to the contractor — or cancel and refund.

### Storage layout
| Key | Type | Description |
|---|---|---|
| `Milestone(org_id: u64, milestone_id: u64)` | `MilestoneRecord { contractor: Address, amount: i128, status: MilestoneStatus }` | |
| `MilestoneCount(org_id: u64)` | `u64` | |
| `EscrowBalance(org_id: u64)` | `i128` | Running total this contract is holding on behalf of the org, for reconciliation/testing — the actual tokens live in this contract's own token balance |
| `PayrollFactory` | `Address` | Network-wide `payroll_factory` address, set once at deploy |
| `TokenAddress` | `Address` | Network-wide USDC SAC address, set once at deploy — needed because `release_milestone` transfers directly out of this contract's own balance (funds already left `treasury` in `fund_milestone`), not via another `treasury.transfer_out` call |
| `OrgRecordCache(org_id: u64)` | `OrgRecord` | Cached `organization`/`treasury` addresses for an org (former for role checks, latter for `fund_milestone`'s `transfer_out` and `cancel_milestone`'s refund `deposit`), populated on that org's first milestone-engine operation |

`MilestoneStatus` enum: `Draft, Funded, Approved, Released, Cancelled`.

### Events
- `milestone_created { org_id: u64, milestone_id: u64, contractor: Address, amount: i128 }`
- `milestone_funded { org_id: u64, milestone_id: u64 }`
- `milestone_approved { org_id: u64, milestone_id: u64, approver: Address }`
- `milestone_released { org_id: u64, milestone_id: u64, contractor: Address, amount: i128 }`
- `milestone_cancelled { org_id: u64, milestone_id: u64, refunded: bool }`

### Errors
- `E_MILESTONE_NOT_FOUND`
- `E_INVALID_STATE_TRANSITION`
- `E_NOT_AUTHORIZED`
- `E_ALREADY_INITIALIZED` (shared with `payroll_factory`/`employee_registry`/`payroll_engine`; this engine's own one-time `initialize` call)

### Public functions
- `initialize(factory: Address, token: Address)` — one-time setup, callable once (`E_ALREADY_INITIALIZED` thereafter); deployed and initialized standalone like `payroll_engine`, per [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).
- `create_milestone(caller: Address, org_id: u64, contractor: Address, amount: i128) -> u64` — requires Finance role; status `Draft`. ("Finance **or** Admin" throughout this contract's functions is exactly `require_role(caller, Role::Finance)` — the role hierarchy already has `Admin`/`Owner` satisfy a `Finance` minimum, per [PERMISSION_MODEL.md](./PERMISSION_MODEL.md) §1, so no separate check is needed.)
- `fund_milestone(caller: Address, org_id: u64, milestone_id: u64)` — requires Finance role and `Draft` status; calls `treasury.transfer_out(..., to: milestone_engine_address, reason: "milestone_fund")`, moving funds from the org's treasury into this contract's own balance; sets status `Funded`.
- `approve_milestone(caller: Address, org_id: u64, milestone_id: u64)` — requires Finance **or** Admin role and `Funded` status; sets status `Approved`. Kept separate from `release` so an org can require a distinct "sign-off" step (e.g., HR/PM confirms deliverable) before Finance finally releases funds — see
  [MILESTONE_ENGINE.md](./MILESTONE_ENGINE.md) for the recommended two-person pattern.
- `release_milestone(caller: Address, org_id: u64, milestone_id: u64)` — requires Finance role and `Approved` status; transfers escrowed amount to `contractor`; sets status `Released`.
- `cancel_milestone(caller: Address, org_id: u64, milestone_id: u64)` — requires Finance/Admin role; allowed from `Draft` (no-op refund, nothing was escrowed) or `Funded` (refunds the escrowed amount to the org's `treasury` via a direct token transfer from this contract's own balance to `treasury`'s address — not `treasury.deposit`, since Soroban's implicit contract self-authorization only recognizes the *immediate* caller of a call, and `deposit`'s internal token transfer would need `milestone_engine` to be that immediate caller of the *token* contract, which it isn't when routed through `treasury.deposit`; the same direct-transfer approach `release_milestone` already uses); rejected from `Approved`/`Released` (`E_INVALID_STATE_TRANSITION` — an approved-for-release milestone must be released or the org must resolve it as a separate manual `treasury.withdraw`, not silently cancelled).
- `get_milestone(org_id, milestone_id) -> MilestoneRecord` — read-only.

### Internal functions
- `assert_transition(current: &MilestoneStatus, expected: &MilestoneStatus)`.

### Access control
Same delegation pattern to the org's `organization` contract as the other
engines.

### Security considerations
- **Escrow custody**: this is the one place besides `treasury` where the
  contract holds a real token balance for a nonzero duration. Accepted
  because escrow amounts are bounded to open milestones (an org's total
  exposure here is visible via `EscrowBalance` and is always less than or
  equal to what that org itself chose to fund), and because splitting
  "approve" from "release" as two required steps by role-eligible humans
  materially reduces the chance of an errant single-click release.
- State machine transitions are enforced centrally in
  `assert_transition`, not scattered per function, to make the full valid
  transition graph auditable in one place.

### Gas considerations
All operations are O(1) single-milestone reads/writes.

### Upgrade strategy
Shared singleton, migrated per-org via
`organization.set_milestone_engine`. Migrating away from an old milestone
engine instance with open (`Funded`/`Approved`) milestones requires
draining them (release or cancel) on the old instance first — documented
as an operational runbook step, not enforced in code, since it's an
infrequent admin operation.

### Testing strategy
Unit tests: full happy-path state machine walk (`Draft -> Funded ->
Approved -> Released`), cancellation from `Draft` and `Funded` refunds
correctly, cancellation rejected from `Approved`/`Released`, unauthorized
caller rejected at every transition, double-release rejected.
