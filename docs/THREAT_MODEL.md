# Threat Model

STRIDE-oriented enumeration of key threats and the mitigation already
designed into the architecture (cross-referenced, not re-explained).

## 1. Attack surface map

```
[Browser/Wallet] --HTTPS--> [Backend API] --RPC/Horizon--> [Stellar Testnet]
       |                          |
       |                          +--> [PostgreSQL]
       +--(direct)--> [Stellar Testnet]  (transaction submission only, per BLOCKCHAIN_ARCHITECTURE §5 the backend relays this)
```

Entry points: public API (`/api/v1/*`), auth endpoints, wallet signing
UI, CI/CD deploy pipeline (contract deployment), the Event Indexer's RPC
polling.

## 2. Threats by category

### Spoofing
- **Threat**: attacker claims to be an org member without valid
  credentials. **Mitigation**: session-based auth
  ([AUTHENTICATION.md](./AUTHENTICATION.md)), wallet-login signature
  verification against actual on-chain signer weight.
- **Threat**: attacker spoofs a wallet address in an API request without
  controlling it. **Mitigation**: any action attributed to a wallet
  requires that wallet to actually sign the relevant transaction/challenge
  — the backend never trusts a bare address string as proof of control.

### Tampering
- **Threat**: attacker intercepts/modifies a signed transaction in
  transit to redirect funds. **Mitigation**: HTTPS everywhere; more
  fundamentally, Stellar transaction signatures cover the transaction's
  exact operations (including destination address and amount) — any
  tampering invalidates the signature and the network rejects it, so even
  a compromised backend relaying the XDR cannot silently redirect an
  already-signed payment.
- **Threat**: malicious backend/DB compromise alters `Employee.walletAddress`
  to redirect future payroll to an attacker's wallet. **Mitigation**: this
  is the primary residual risk of the two-phase off-chain/on-chain model —
  see §4 "Accepted risks" below. Mitigated by requiring a fresh HR-role
  signature (`update_employee`... actually wallet changes require
  re-registration, see [EMPLOYEE_MODEL.md](./EMPLOYEE_MODEL.md)) for any
  wallet-address change, and by `AuditLog` making such a change visible to
  every Viewer+ role immediately.

### Repudiation
- **Threat**: an Admin denies having approved a milestone release.
  **Mitigation**: `AuditLog` (actor, action, timestamp) plus the on-chain
  transaction itself, which cryptographically proves whose signature
  authorized the release — stronger than a typical off-chain audit log
  alone.

### Information Disclosure
- **Threat**: cross-tenant data leak (Org A sees Org B's employees).
  **Mitigation**: every query scoped by `organizationId`
  ([DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) notes), every contract
  storage key scoped by `org_id`
  ([SMART_CONTRACT_SPECIFICATION.md](./SMART_CONTRACT_SPECIFICATION.md)),
  tested explicitly with cross-org access attempts.
- **Threat**: PII leakage via on-chain data (immutable, public ledger).
  **Mitigation**: PII is never written on-chain at all — only wallet
  addresses, amounts, and status flags (see
  [EMPLOYEE_MODEL.md](./EMPLOYEE_MODEL.md) §"Why PII stays off-chain").
- **Threat**: sensitive data in logs. **Mitigation**:
  [LOGGING.md](./LOGGING.md) §4 redaction rules.

### Denial of Service
- **Threat**: API flooding. **Mitigation**: rate limiting
  ([SECURITY_MODEL.md](./SECURITY_MODEL.md) §6).
- **Threat**: an org's payroll run is deliberately oversized to exhaust
  Soroban resource limits. **Mitigation**: backend-enforced chunking
  before submission ([PAYROLL_ENGINE.md](./PAYROLL_ENGINE.md) §2) — a
  transaction is never built larger than the known-safe resource budget.
- **Threat**: Event Indexer starved by RPC rate limits during high
  activity. **Mitigation**: BullMQ backoff/retry, per-contract cursor
  isolation so one contract's backlog doesn't block others.

### Elevation of Privilege
- **Threat**: a Viewer-role user calls a Finance-only endpoint directly
  (bypassing UI). **Mitigation**: `OrgRoleGuard` enforced server-side on
  every request regardless of UI affordances, backstopped by the contract
  layer's independent role check.
- **Threat**: a compromised `payroll_engine`/`milestone_engine` singleton
  (bug or malicious redeploy) attempts to drain an org's treasury.
  **Mitigation**: `treasury.transfer_out` requires the human `authorizer`'s
  fresh `require_auth()` **and** their current `Finance`-role standing on
  that specific org, re-checked on every call — a compromised engine
  contract cannot move funds without a legitimately-authorized human
  signature attached to that exact call, and even then only for the
  amount specified in the operation it can see, not an arbitrary drain
  (there is no "transfer_out(anything)" the engine can call unilaterally
  without a matching human-authorized operation).

## 3. Blockchain-specific threats

- **Front-running**: Soroban/Stellar's deterministic fee/ordering model
  and the nature of these operations (payroll/milestone payments have no
  price-sensitive MEV opportunity — there's no slippage or arbitrage
  surface in a fixed-amount transfer) make classic front-running
  irrelevant here.
- **Contract upgrade risk**: mitigated by the no-proxy, explicit-migration
  model in [BLOCKCHAIN_ARCHITECTURE.md](./BLOCKCHAIN_ARCHITECTURE.md) §4 —
  no single actor can silently swap a contract's logic underneath an org.
- **Compromised factory admin key**: limited blast radius — the factory
  admin can only change which WASM hash is used for *future* org
  deployments; it has no authority over existing orgs' treasuries.

## 4. Accepted risks (documented, not silently ignored)

- **Off-chain-to-on-chain wallet binding**: an employee's payroll
  ultimately goes to whatever wallet address is registered in
  `employee_registry`. If an HR-role account is compromised, an attacker
  with that access could re-register an employee's wallet to one they
  control. This is inherent to any system where a human role manages payee
  destination data; mitigated (not eliminated) by requiring a real
  signature from a current HR/Admin role holder for the change (not just a
  DB write) and full audit-log visibility to all org Viewers, which makes
  such a change immediately visible for the org to catch and revoke the
  compromised account's role.
- **Testnet-only trust assumptions**: MVP explicitly does not defend
  against economic attacks that would matter at mainnet scale (e.g.,
  sophisticated key-management compromise of an org's own treasury wallet)
  — that is the organization's own operational security responsibility,
  clearly out of WorkforceOS's control since it never custodies those
  keys.
