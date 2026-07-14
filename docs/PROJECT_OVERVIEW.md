# Project Overview

## What WorkforceOS is

WorkforceOS is an enterprise workforce finance operating system. Organizations
create a workspace, connect a Stellar treasury wallet, deposit USDC, register
employees and contractors, define compensation terms, and execute payroll
runs and milestone-based contractor payments — all settled on Stellar
Testnet through purpose-built Soroban smart contracts.

The product's thesis: payroll and contractor payments for distributed,
crypto-native organizations are currently handled by spreadsheets, manual
wallet transfers, or centralized custodial platforms that require trusting a
company with your treasury. WorkforceOS replaces manual transfers with
auditable, programmable, non-custodial disbursement while keeping the
day-to-day HR/finance workflow as simple as a modern SaaS dashboard.

## Design philosophy

| Principle | Meaning here |
|---|---|
| On-chain = money | Every balance change, payroll disbursement, and milestone release is a Soroban contract call. The database never represents itself as authoritative about fund state; it caches and indexes what the chain says. |
| Off-chain = people & process | Names, emails, departments, approval workflows, CSV imports, analytics — anything that isn't literally moving an asset — lives in Postgres, where it's cheap to query and easy to change. |
| Non-custodial by construction | The backend holds no private keys for organizational treasuries. Transactions are built by the backend/SDK, signed by the user's connected wallet (Freighter or similar), and submitted to Stellar. |
| Modular over upgradeable | Contracts are not proxy-upgradeable. New logic ships as a new WASM deployment; organizations/admins opt into migrating pointers. This trades upgrade convenience for a smaller, auditable blast radius per contract. |
| Boring, readable infrastructure | NestJS, Prisma, Next.js, Postgres — no exotic infra choices. The novelty budget of this project is spent entirely on the Stellar/Soroban integration. |

## Target users

- **Web3 startups** — small teams paying contributors in USDC without a
  finance department.
- **DAOs** — need transparent, auditable treasury disbursement that members
  can independently verify on-chain.
- **Foundations & grant programs** — milestone-based payments to grantees
  with clear approve/release workflows.
- **Open-source organizations** — recurring maintainer payroll and one-off
  bounty/milestone payments.
- **Remote companies & agencies** — global contractor payroll without
  banking-rail delays or FX friction, settled in USDC.

## What's in the MVP

Authentication, Organization Management, Treasury, Employee Registry,
Contractor Registry, Payroll, Milestone Payments, Treasury Dashboard,
Analytics Dashboard, Transaction History, Wallet Integration, Batch
Payments, CSV Employee Import, Role-Based Permissions, Event Indexing,
Responsive UI.

Full detail in [PRODUCT_REQUIREMENTS_DOCUMENT.md](./PRODUCT_REQUIREMENTS_DOCUMENT.md).

## What's explicitly out of scope for the MVP

Streaming/continuous payroll, token vesting schedules, on-chain governance,
AI features, accounting-software integrations (QuickBooks/Xero/etc.),
notification systems (email/Slack/push). These are tracked as future
roadmap items in [ROADMAP.md](./ROADMAP.md) and must not leak into MVP
architecture as half-built hooks.

## Canonical architecture decisions (read before writing any doc or code)

These are locked decisions. Any doc referencing contracts, database
entities, or API routes must stay consistent with this section. Changing
one of these requires updating this file and every downstream document in
the same change.

**Smart contracts** (Soroban, deployed to Stellar Testnet), see
[SMART_CONTRACT_SPECIFICATION.md](./SMART_CONTRACT_SPECIFICATION.md):

1. `payroll_factory` — deploys a new `organization` + `treasury` contract
   pair per organization, using Soroban's contract deployer with a pinned
   WASM hash per release channel. Maintains the on-chain org registry.
2. `organization` — one instance per org. Identity, role assignments
   (Owner/Admin/Finance/HR mapped to Stellar addresses), and pointers to
   that org's `treasury` instance and the network-wide singleton contracts.
3. `treasury` — one instance per org (deployed alongside `organization`).
   Holds the org's USDC (via SAC) balance. Only the `payroll_engine` and
   `milestone_engine` singleton contracts may pull funds, and only with the
   org's Finance/Admin authorization propagated through the call.
4. `employee_registry` — one network-wide, multi-tenant singleton. Storage
   keyed by `(org_id, employee_id)`. Stores wallet address, salary amount,
   pay currency, pay frequency, active flag — the minimum needed to
   authorize a payment. PII stays in Postgres.
5. `payroll_engine` — one network-wide singleton. Executes payroll runs as
   batched transfers from an org's `treasury` to registered employee
   wallets, keyed by an idempotent `run_id`.
6. `milestone_engine` — one network-wide singleton. Escrows contractor
   milestone funds pulled from an org's `treasury` and releases them to a
   contractor wallet on approval.
7. `common` — a Rust library crate (not deployed) with shared errors,
   event topics, storage-key helpers, and the role enum, imported by all
   six contracts.

**Why per-org Treasury but shared Employee Registry/Payroll/Milestone
engines?** Isolating the fund-holding contract per organization bounds the
blast radius of any single compromised organization to that organization's
own balance — a bug or malicious admin in Org A's treasury can never touch
Org B's funds. The engines and registry don't hold funds themselves (they
only read authorization data or hold escrow tagged by ID), so sharing them
network-wide avoids per-org deployment cost and gives a single upgrade
surface for payroll/milestone logic.

**Database** (PostgreSQL via Prisma), see
[DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md): `User`, `Session`,
`Organization`, `OrganizationMember`, `Department`, `Employee`,
`Contractor`, `PayrollRun`, `PayrollItem`, `Milestone`, `Transaction`,
`Wallet`, `AuditLog`, `IndexerCursor`.

**Backend**: NestJS, modular by domain (auth, organizations, treasury,
employees, contractors, payroll, milestones, transactions, analytics,
indexer). See [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md).

**Frontend**: Next.js 15 App Router, org-scoped routes under
`/org/[orgId]/...`. See [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md).

**Auth**: Better Auth for email/password + session, plus a SEP-10-style
wallet challenge/response for Stellar wallet login, both issuing the same
JWT session shape. Roles: `OWNER`, `ADMIN`, `FINANCE`, `HR`, `VIEWER`,
scoped per organization. See [AUTHENTICATION.md](./AUTHENTICATION.md) and
[PERMISSION_MODEL.md](./PERMISSION_MODEL.md).

## Documentation index

| Area | Documents |
|---|---|
| Foundation | README, PROJECT_OVERVIEW, PRODUCT_REQUIREMENTS_DOCUMENT, ROADMAP, DEVELOPMENT_PLAN |
| Architecture | SYSTEM_ARCHITECTURE, TECHNICAL_ARCHITECTURE, PROJECT_STRUCTURE |
| Blockchain | BLOCKCHAIN_ARCHITECTURE, SMART_CONTRACT_SPECIFICATION, TREASURY_ARCHITECTURE, PAYROLL_ENGINE, MILESTONE_ENGINE |
| Data | DATABASE_SCHEMA, ER_DIAGRAM, API_SPECIFICATION, OPENAPI_SPEC, EVENT_INDEXING |
| Backend | BACKEND_ARCHITECTURE, ERROR_HANDLING, LOGGING |
| Frontend | FRONTEND_ARCHITECTURE, UI_UX_GUIDELINES, DESIGN_SYSTEM, STATE_MANAGEMENT, WIREFRAMES, USER_FLOWS |
| Security | AUTHENTICATION, SECURITY_MODEL, THREAT_MODEL, PERMISSION_MODEL |
| Domain | EMPLOYEE_MODEL, CONTRACTOR_MODEL, CSV_IMPORT |
| Quality & Ops | TESTING_STRATEGY, DEPLOYMENT_GUIDE, DEVOPS, DOCKER_SETUP, CI_CD |
| Diagrams & Demo | SEQUENCE_DIAGRAMS, CLASS_DIAGRAMS, SCF_DEMO |
