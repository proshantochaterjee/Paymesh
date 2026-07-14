# Product Requirements Document (PRD)

## 1. Problem statement

Crypto-native and remote-first organizations need to pay people —
employees and contractors — in a way that is auditable, fast, low-fee, and
does not require handing custody of the treasury to a third party. Today
they use a mix of manual wallet transfers (error-prone, no audit trail),
spreadsheets (no automation), or custodial payroll platforms (re-introduces
the trust problem crypto is meant to remove). WorkforceOS gives them a
single workspace to manage the organizational side (who gets paid, how
much, on what schedule) while every actual payment is a signed, verifiable
Soroban contract call.

## 2. Personas

| Persona | Role in product | Primary goals |
|---|---|---|
| **Org Owner** | Creates the organization, connects the treasury wallet, invites admins | Get the org and treasury set up correctly once; delegate day-to-day operation |
| **Finance/Admin** | Runs payroll, approves and releases milestones, monitors treasury | Execute payment runs quickly and correctly; avoid double-payment or missed payment; audit every disbursement |
| **HR** | Manages employee/contractor records, CSV imports | Keep compensation data accurate without touching money movement |
| **Viewer** (e.g., board member, auditor, DAO member) | Read-only access to dashboards and transaction history | Verify spend without being able to change it |
| **Employee/Contractor** (payee) | Receives payments to their wallet | Get paid on schedule/on milestone approval, verifiable on-chain |

## 3. MVP scope

### 3.1 In scope

1. **Authentication** — email/password (Better Auth) and Stellar wallet
   login (challenge/response), unified session/JWT.
2. **Organization Management** — create org, invite members, assign roles,
   manage org profile.
3. **Treasury** — connect a Stellar wallet as the org treasury, deposit
   USDC, view balance and deposit/withdraw history.
4. **Employee Registry** — CRUD employee records: name, email, wallet,
   salary, currency (USDC), pay frequency, department, status.
5. **Contractor Registry** — CRUD contractor records: name, email, wallet,
   status; contractors are paid via milestones, not payroll runs.
6. **Payroll** — define a payroll run (which employees, which pay period),
   preview total cost, execute as a batched on-chain disbursement.
7. **Milestone Payments** — create a milestone for a contractor with an
   amount, fund it from treasury (escrow), approve, release to contractor,
   or cancel/refund.
8. **Treasury Dashboard** — current balance, inflow/outflow trend, pending
   obligations (scheduled payroll + open milestones).
9. **Analytics Dashboard** — payroll cost over time, headcount, spend by
   department, milestone completion rate.
10. **Transaction History** — full list of on-chain transactions tied to
    the org, filterable by type/date/status, linked to Stellar Explorer.
11. **Wallet Integration** — Freighter (and any Stellar-compatible wallet
    supporting the same signing interface) for treasury connection and
    transaction signing.
12. **Batch Payments** — a payroll run is inherently a batch of transfers
    executed as part of one authorized on-chain operation set.
13. **CSV Employee Import** — bulk-create/update employees from a CSV file
    with validation and a dry-run preview before commit.
14. **Role-Based Permissions** — Owner/Admin/Finance/HR/Viewer, enforced at
    the API layer and reflected in UI affordances.
15. **Event Indexing** — a backend indexer service ingests Soroban contract
    events from Stellar RPC and materializes them into the `Transaction`
    table so the UI never queries the chain directly for lists/history.
16. **Responsive UI** — full functionality usable down to tablet width;
    graceful degraded (read-mostly) experience on mobile widths.

### 3.2 Explicitly out of scope for MVP

- Streaming/continuous payroll (e.g., per-second vesting-style payroll)
- Token vesting schedules (cliff/linear vesting contracts)
- On-chain governance (voting, proposals)
- AI features (no LLM-driven anything in the MVP)
- Accounting integrations (QuickBooks, Xero, NetSuite, etc.)
- Notifications (email, Slack, push, in-app toasts persisted across
  sessions are fine; durable notification infra is not)

These are tracked in [ROADMAP.md](./ROADMAP.md) so that the architecture
leaves room for them without building any part of them now.

## 4. Functional requirements by feature

Each feature's detailed functional/non-functional requirements live in its
own architecture document to avoid duplication; this section defines
acceptance-level scope only.

- **Treasury**: an org must have exactly one treasury contract instance;
  deposits are user-initiated wallet-to-contract transfers; withdrawals
  require Admin/Owner role and are logged to `AuditLog`.
- **Payroll**: a payroll run is immutable once executed (no editing amounts
  post-execution); a failed item within a batch does not roll back
  successful items — see [PAYROLL_ENGINE.md](./PAYROLL_ENGINE.md) for
  partial-failure semantics.
- **Milestones**: state machine is `DRAFT -> FUNDED -> APPROVED -> RELEASED`
  with a `CANCELLED` escape from `DRAFT` or `FUNDED` (refunds to treasury).
  See [MILESTONE_ENGINE.md](./MILESTONE_ENGINE.md).
- **CSV Import**: must validate every row before any write; supports a
  dry-run mode returning per-row errors; see
  [CSV_IMPORT.md](./CSV_IMPORT.md).
- **Permissions**: every mutating API endpoint declares its minimum
  required role; see [PERMISSION_MODEL.md](./PERMISSION_MODEL.md).

## 5. Non-functional requirements

- **Security**: no backend-held private keys for org funds; all fund
  movement is signed client-side or via a wallet the org explicitly
  authorizes. See [SECURITY_MODEL.md](./SECURITY_MODEL.md) and
  [THREAT_MODEL.md](./THREAT_MODEL.md).
- **Auditability**: every state-changing action (role change, payroll
  execution, milestone release) writes an `AuditLog` row with actor,
  action, entity, and metadata.
- **Consistency**: the `Transaction` table is an eventually-consistent
  projection of on-chain state via the event indexer, never the source of
  truth for balances shown as "confirmed."
- **Performance**: dashboard pages must render primary content within 1s
  on a warm cache (TanStack Query) against seeded demo data.
- **Accessibility**: WCAG 2.1 AA for all primary flows (forms, tables,
  dashboards).
- **Testnet-only for MVP**: no mainnet asset handling; all USDC is Testnet
  SAC-issued test USDC.

## 6. Success criteria (SCF-quality bar)

- A reviewer can clone the repo, run `docker compose up`, and walk through
  create-org → deposit → add employee → run payroll → see it settle on
  Stellar Testnet Explorer, using [SCF_DEMO.md](./SCF_DEMO.md) as the
  script.
- Contracts have unit + integration test coverage for every public
  function and documented error path.
- No module ships without: architecture doc, implementation, tests, and a
  passing CI run.

## 7. Open questions to resolve before backend implementation begins

- Exact USDC Testnet SAC contract ID to standardize on (Circle's testnet
  issuer vs. a self-issued test asset) — record the decision in
  [BLOCKCHAIN_ARCHITECTURE.md](./BLOCKCHAIN_ARCHITECTURE.md) once made.
- Whether Owner role is a distinct role or `ADMIN` with an
  `is_org_owner` flag — currently modeled as a distinct role, see
  [PERMISSION_MODEL.md](./PERMISSION_MODEL.md).
