# Blockchain Architecture

## 1. Network

- **Network**: Stellar Testnet exclusively for the MVP. No mainnet
  configuration exists in code; environment config has a single
  `STELLAR_NETWORK=testnet` value and there is no code path that accepts
  `public` until a post-MVP security audit is scoped.
- **RPC**: Soroban RPC (`https://soroban-testnet.stellar.org`) for contract
  simulation, transaction submission, and event queries.
- **Horizon**: Testnet Horizon (`https://horizon-testnet.stellar.org`) for
  classic-layer account/balance queries (e.g., confirming a wallet holds
  enough XLM for fees) and as a fallback for historical queries the RPC
  event API doesn't serve well.
- **Asset**: USDC represented via a Stellar Asset Contract (SAC) on
  Testnet. **Decided in Step 9**: self-issued `TUSDC` (the deployer
  account is its own issuer), not Circle's Testnet USDC issuer — no
  external dependency, and the issuer account can mint arbitrary TUSDC
  for demo/seed treasury deposits. Deployed address recorded in
  [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) §3. Every contract still
  takes the USDC SAC address as an `init` parameter, never a compiled-in
  constant, so this choice is swappable without a contract redeploy.

## 2. Contract topology

See canonical list in
[PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md#canonical-architecture-decisions-read-before-writing-any-doc-or-code)
and full interface detail in
[SMART_CONTRACT_SPECIFICATION.md](./SMART_CONTRACT_SPECIFICATION.md).

```
payroll_factory  ──deploys──▶  organization (per org)
                 ──deploys──▶  treasury (per org)

organization  ──references──▶  treasury (its own)
              ──references──▶  employee_registry (shared)
              ──references──▶  payroll_engine (shared)
              ──references──▶  milestone_engine (shared)

payroll_engine    ──reads────▶  employee_registry
                  ──calls────▶  treasury.transfer_out (org-scoped)

milestone_engine  ──calls────▶  treasury.transfer_out (fund) / holds escrow
                  ──calls────▶  treasury.deposit (refund on cancel)

treasury  ──holds & transfers──▶  USDC SAC token contract
```

## 3. Why per-org Treasury, shared everything else

Restated from PROJECT_OVERVIEW with the security reasoning made explicit:
the only contract that custodies funds is `treasury`. Giving each
organization its own `treasury` instance means the maximum possible loss
from any single exploited authorization bug, compromised admin key, or
contract-logic error is bounded to that one organization's balance. The
`employee_registry`, `payroll_engine`, and `milestone_engine` contracts
never hold a persistent balance of an org's funds beyond the lifetime of a
single atomic invocation (milestone escrow is the one exception — see
[MILESTONE_ENGINE.md](./MILESTONE_ENGINE.md) §"Escrow custody" for why that
is still acceptable), so sharing them network-wide is a deployment-cost and
upgrade-surface optimization, not a security compromise.

## 4. Upgrade strategy: modular deployment, not proxies

Per the master requirement, **no upgradeable proxy pattern is used**.
Instead:

- Every contract is deployed as an immutable WASM instance at a fixed
  contract address.
- `payroll_factory` stores a **WASM hash per release channel** (e.g.,
  `organization_wasm_hash`, `treasury_wasm_hash`) that it uses when
  deploying new org instances. Bumping a hash only affects organizations
  created after the bump; existing organizations keep running their
  original, audited bytecode.
- The shared singletons (`employee_registry`, `payroll_engine`,
  `milestone_engine`) upgrade by deploying a **new contract instance** of
  the new WASM and having each `organization` contract's admin explicitly
  call `organization.set_payroll_engine(new_address)` (etc.) to point at
  it — an explicit, audited, per-org opt-in migration, not an automatic
  proxy swap. This is slower than a proxy upgrade by design: it trades
  upgrade convenience for the guarantee that an org's admin always knows
  exactly which bytecode is authorized to move their funds.
- Old singleton instances are never deleted; an org that never migrates
  keeps working against the old instance indefinitely (until its own admin
  chooses to migrate), which also means a bug fix cannot be silently forced
  onto an org without its consent.

## 5. Transaction construction, signing, and submission

**Decision: the backend builds unsigned transactions; the wallet signs
client-side; the backend submits the signed transaction and confirms it.**

| Step | Who | Detail |
|---|---|---|
| Build | Backend (`packages/sdk`) | Simulates the contract call via RPC to get accurate resource fees, assembles the transaction, returns base64 XDR to the frontend |
| Sign | Wallet (Freighter), in-browser | The private key never leaves the wallet extension; backend never sees it |
| Submit | Backend | Frontend posts the signed XDR back to the relevant API endpoint (e.g., `POST /payroll-runs/:id/execute`); backend submits to Soroban RPC and polls for the transaction result |
| Confirm | Backend | On success, backend updates the corresponding Postgres row's status optimistically to `SUBMITTED` immediately, then to `CONFIRMED` once the Event Indexer independently observes the on-chain event (never trusts its own submission result alone as the final state) |

**Trade-off considered**: having the frontend submit directly to Stellar
RPC was rejected because it would require the frontend to independently
implement submission retries/timeout handling already needed elsewhere in
the backend for the indexer's reconciliation jobs, and it would leave the
backend unable to record a `SUBMITTED` status synchronously with the API
response. Routing the signed blob through the backend does **not** make
the backend custodial — it never possesses a private key and cannot alter
or re-sign a transaction that is already signed; it is purely a relay and
confirmation-tracking step.

## 6. Event indexing approach

Covered fully in [EVENT_INDEXING.md](./EVENT_INDEXING.md); summary: a
NestJS worker polls `getEvents` on Soroban RPC for the six known contract
addresses since the last recorded ledger sequence per contract
(`IndexerCursor`), decodes event topics/data using the shared contract
event schema from `common`, and upserts `Transaction` rows.

## 7. Key management

- Organization treasury signing keys belong to the org (Owner/Admin/Finance
  role holders' individual wallets, or a dedicated treasury multisig wallet
  the org configures) — never generated or stored by WorkforceOS.
- Contract deployer/admin key (used by `payroll_factory` to deploy new org
  contracts) is an infrastructure secret held in the deployment
  environment's secret manager, used only by CI/CD deploy jobs — see
  [SECURITY_MODEL.md](./SECURITY_MODEL.md) §"Secret management".

## 8. Fees

Testnet fees are negligible but payroll batch operations still resource-
cost scale with employee count. `payroll_engine.run_payroll` is designed
to be called in **chunks** (see [PAYROLL_ENGINE.md](./PAYROLL_ENGINE.md)
§"Batching") to stay within Soroban's per-transaction resource limits
rather than assuming an organization's entire headcount fits one
transaction.
