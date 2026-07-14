# Security Model

## 1. Core invariant

**The backend never holds a private key capable of moving organizational
funds.** This is the single most load-bearing security property of the
system and every other decision in this document exists to protect it.
Verify this invariant explicitly in code review for any PR touching
`packages/sdk`, the `treasury`/`payroll`/`milestones` backend modules, or
deployment configuration.

## 2. Secret management

| Secret | Where it lives | Who/what uses it |
|---|---|---|
| Database credentials | Platform secret manager (Railway/Render env vars), never committed | Backend only |
| JWT signing secret | Platform secret manager | Backend only |
| Contract deployer/admin key (for `payroll_factory` WASM-hash updates and initial contract deployment) | CI/CD secret store (GitHub Actions encrypted secrets), used only in deploy workflows, never present in the running backend/frontend | Deploy pipeline only |
| Org treasury signing keys | User's own wallet (Freighter) or org-configured multisig | Never touches WorkforceOS infrastructure at all |
| USDC SAC / RPC endpoint URLs | Plain config (not secret) | Backend, frontend (public RPC URL only) |

No `.env` file with real secrets is ever committed; `.env.example` files
document required variable names with placeholder values.

## 3. Input validation

Every API boundary validates with Zod schemas from `packages/shared`
before touching the database or building a chain transaction — this
includes validating that wallet addresses are well-formed Stellar
`G...`/contract `C...` addresses (checksum-validated, not just regex
shape) before ever including them in a transaction, preventing malformed-
address transactions from being simulated/submitted.

## 4. Authorization

Covered fully in [PERMISSION_MODEL.md](./PERMISSION_MODEL.md). Summary:
API-layer RBAC is UX; contract-layer role checks are the actual security
boundary.

## 5. Replay protection

- **Wallet login challenge**: single-use nonce, 5-minute TTL (see
  [AUTHENTICATION.md](./AUTHENTICATION.md) §2).
- **Payment intents**: single-use `intentId`, 5-minute TTL, consumed on
  first successful submit (`409 INTENT_ALREADY_SUBMITTED` on reuse).
- **Payroll runs**: on-chain `run_id` idempotency guard prevents
  double-execution even if the backend somehow submits the same signed
  transaction twice (network retry, etc.) — the second submission fails at
  the contract level, not just the API level.
- **Stellar transaction-level replay**: standard Stellar sequence-number
  and time-bounds mechanisms apply to every transaction the SDK builds
  (time-bounds set to the intent's expiry).

## 6. Rate limiting

`@nestjs/throttler` applied globally (default: 100 req/min per IP for
authenticated routes, 10 req/min for `/auth/*` unauthenticated routes) to
blunt credential-stuffing and challenge-spam attempts. Intent-building
endpoints (which trigger an RPC simulation call) have a tighter per-org
limit to avoid an org member accidentally hammering Testnet RPC.

## 7. Signature verification

- Wallet login: verifies the signed nonce against the claimed account's
  actual signer weight/threshold via Horizon (not just "a valid Ed25519
  signature exists," but "this account's medium-threshold signing
  requirement is met" for accounts with custom signer configurations).
- Transaction submission: the backend never re-signs or modifies a signed
  XDR blob; it is submitted byte-for-byte as received, so any signature
  validity is exactly what Stellar's own consensus already checks — no
  custom signature-verification logic to get wrong on the backend side for
  actual payments.

## 8. Dependency & supply chain

- Rust contract dependencies pinned via `Cargo.lock`, committed.
- Node dependencies pinned via lockfile (`package-lock.json`/`pnpm-lock.yaml`),
  committed; Dependabot (or equivalent) enabled for security advisories.
- Contract crates avoid unnecessary third-party dependencies beyond
  `soroban-sdk` itself to minimize audit surface.

## 9. Audit logging

Every state-changing action writes an immutable `AuditLog` row (actor,
action, entity, metadata, timestamp) — see
[DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md). `AuditLog` rows are
`onDelete: Restrict` on the actor relation and never updated after
insert (append-only).

## 10. Pre-launch security checklist (before any mainnet consideration — explicitly out of MVP scope, listed for completeness)

- Independent smart contract audit of all six contracts.
- Formal fuzz testing of `payroll_engine`/`milestone_engine` batch/state
  logic.
- Penetration test of the backend API.
- Key-management review for any future org-side multisig tooling
  WorkforceOS might recommend (not build/custody).

See [THREAT_MODEL.md](./THREAT_MODEL.md) for the enumerated threat
scenarios this model defends against.
