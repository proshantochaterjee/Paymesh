# API Specification

Base URL: `/api/v1`. All request/response bodies are JSON. All endpoints
except `/auth/*` require a valid session (Bearer JWT or session cookie via
Better Auth). Machine-readable version: [OPENAPI_SPEC.md](./OPENAPI_SPEC.md)
(generated from NestJS decorators via `@nestjs/swagger` at build time; this
document is the human-authored source of intent that generated spec must
match).

Conventions:
- All list endpoints support `?page=&pageSize=` (default `pageSize=20`,
  max `100`) and return `{ data: T[], meta: { page, pageSize, total } }`.
- All mutating endpoints require the caller's `OrganizationMember.role` to
  meet the documented minimum (see [PERMISSION_MODEL.md](./PERMISSION_MODEL.md)).
- Validation is via Zod schemas shared from `packages/shared`, applied
  through a NestJS `ZodValidationPipe`. Validation failures return `400`
  with `{ error: "VALIDATION_ERROR", details: [...] }`.
- Errors follow the shape defined in
  [ERROR_HANDLING.md](./ERROR_HANDLING.md): `{ error: string, message: string, details?: unknown }`.

## Auth

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/auth/register` | POST | none | Create a `User` with email/password |
| `/auth/login` | POST | none | Email/password login, returns session |
| `/auth/logout` | POST | session | Invalidate current session |
| `/auth/refresh` | POST | session | Mint a short-lived (15 min) bearer JWT from the caller's current session, per [AUTHENTICATION.md](./AUTHENTICATION.md) §4's bearer mode |
| `/auth/session` | GET | session | Step 15 addition: returns `{ id, email, primaryWallet }` for the caller's current session — the only way the frontend can learn "who is logged in" (the session cookie is httpOnly), needed to derive the caller's role in an org (via the members list) for role-based UI gating |
| `/auth/wallet/challenge` | POST | none | Body: `{ address }`. Returns a one-time nonce to sign |
| `/auth/wallet/verify` | POST | none | Body: `{ address, signedNonce }`. Verifies signature, creates/links `User`, returns session |
| `/auth/wallet/link` | POST | session | Body: `{ address, signedNonce }`. Links a wallet to the current `User` for audit attribution (see AUTHENTICATION.md §3) — does not change login capability |

`/auth/register` errors: `400 VALIDATION_ERROR` (weak password — zxcvbn
score < 3, or malformed input), `409 EMAIL_ALREADY_REGISTERED`.
`/auth/login` errors: `401 UNAUTHENTICATED` (wrong email/password).

Full flow in [AUTHENTICATION.md](./AUTHENTICATION.md).

**Example — `POST /auth/wallet/verify`**
Request:
```json
{ "address": "GABC...", "signedNonce": "base64..." }
```
Response `200`:
```json
{ "user": { "id": "usr_123", "primaryWallet": "GABC..." }, "session": { "token": "..." } }
```
Errors: `401 INVALID_SIGNATURE`, `410 CHALLENGE_EXPIRED`. `/auth/wallet/link`
additionally returns `409 WALLET_ALREADY_LINKED` if the address is already
linked to a different `User`.

## Organizations

Step 14 correction: `create_organization`/`grant_role`/`revoke_role` all
require `require_auth()` from a wallet the backend never holds (the owner,
or the acting ADMIN/OWNER), so — unlike this table's original single-call
shape — every mutation below is a build/submit intent pair, same as
Treasury/Employees/Payroll/Milestones (see "Every 'intent' endpoint follows
the same shape" below). `GET` endpoints and profile-only `PATCH` (Postgres
field, no chain call) stay single-call.

| Endpoint | Method | Min role | Purpose |
|---|---|---|---|
| `/organizations` | GET | authenticated | List orgs the caller belongs to |
| `/organizations/create-intent` | POST | authenticated | `201` — unsigned XDR for `payroll_factory.create_organization` |
| `/organizations/create-intent/:intentId/submit` | POST | authenticated | `201` — submits signed XDR; persists the `Organization` row + creator's `OWNER` membership only once confirmed |
| `/organizations/:id` | GET | VIEWER | Org profile |
| `/organizations/:id` | PATCH | ADMIN | Update name (Postgres-only, no chain call) |
| `/organizations/:id/members` | GET | VIEWER | List members + roles |
| `/organizations/:id/members/add-intent` | POST | ADMIN | `201` — unsigned XDR for `organization.grant_role`, body `{ email, role }` |
| `/organizations/:id/members/add-intent/:intentId/submit` | POST | ADMIN | `201` — submits signed XDR; upserts the `OrganizationMember` row once confirmed |
| `/organizations/:id/members/:memberId/role-intent` | POST | ADMIN | `201` — unsigned XDR for `organization.grant_role` (role change), body `{ role }` |
| `/organizations/:id/members/:memberId/role-intent/:intentId/submit` | POST | ADMIN | `200` — submits signed XDR; updates the member's role once confirmed |
| `/organizations/:id/members/:memberId/remove-intent` | POST | ADMIN | `201` — unsigned XDR for `organization.revoke_role` |
| `/organizations/:id/members/:memberId/remove-intent/:intentId/submit` | POST | ADMIN | `200` — submits signed XDR; deletes the `OrganizationMember` row once confirmed |

**Example — `POST /organizations/create-intent/:intentId/submit`**
Response `201`:
```json
{
  "id": "org_123",
  "name": "Acme DAO",
  "slug": "acme-dao",
  "onChainOrgId": "1",
  "organizationContractAddr": "CA...",
  "treasuryContractAddr": "CB..."
}
```
Errors: `409 SLUG_TAKEN` (at `create-intent` build time), `404 USER_NOT_FOUND`
(inviting an email with no registered account), `404 MEMBER_NOT_FOUND`,
`422 INVALID_STATE_TRANSITION` (demoting/removing the last remaining
`OWNER` — checked proactively in Postgres before ever building XDR),
`400 VALIDATION_ERROR` (inviting an already-existing member, or a user with
no linked Stellar wallet), plus the same `410 INTENT_EXPIRED`/
`409 INTENT_ALREADY_SUBMITTED`/`502 SIMULATION_FAILED`/
`502 CHAIN_SUBMISSION_FAILED` categories every other intent endpoint uses.

## Treasury

| Endpoint | Method | Min role | Purpose |
|---|---|---|---|
| `/organizations/:orgId/treasury` | GET | VIEWER | Live balance + pending-obligations projection |
| `/organizations/:orgId/treasury/deposit-intent` | POST | FINANCE | Returns unsigned XDR for a deposit (`201`) |
| `/organizations/:orgId/treasury/deposit-intent/:intentId/submit` | POST | FINANCE | Submit signed XDR (`202`) |
| `/organizations/:orgId/treasury/withdraw-intent` | POST | ADMIN | Returns unsigned XDR for a withdrawal (`201`) |
| `/organizations/:orgId/treasury/withdraw-intent/:intentId/submit` | POST | ADMIN | Submit signed XDR (`202`) |
| `/organizations/:id/transactions` | GET | VIEWER | Paginated `Transaction` history, filterable by `type`/`status`/date range |

Treasury intent-building errors: `404 ORGANIZATION_NOT_FOUND`,
`502 SIMULATION_FAILED` (the on-chain call would fail — e.g. a missing
trustline or insufficient balance — caught at simulation time so the
caller never signs a doomed transaction). Submit errors:
`410 INTENT_EXPIRED` (not found, wrong org, wrong type, or past its 5 min
TTL — all treated identically so a guessed `intentId` can't distinguish
"doesn't exist" from "exists in another org"), `409
INTENT_ALREADY_SUBMITTED`, `502 CHAIN_SUBMISSION_FAILED`.

## Employees

| Endpoint | Method | Min role | Purpose |
|---|---|---|---|
| `/organizations/:orgId/employees` | GET | VIEWER | List (filter by `departmentId`/`status`) |
| `/organizations/:orgId/employees` | POST | HR | `201` — writes the Postgres row and builds a register-intent in one response: `{employee, intentId, unsignedXdr, expiresAt}` |
| `/organizations/:orgId/employees/:employeeId` | GET | VIEWER | Detail |
| `/organizations/:orgId/employees/:employeeId/register-intent/:intentId/submit` | POST | HR | `202` — submits the signed register XDR; backfills `onChainEmployeeId` once confirmed |
| `/organizations/:orgId/employees/:employeeId` | PATCH | HR | `200` — update salary/frequency/department. Response includes an `update-intent` (same shape as create) only if salary/frequency changed *and* the employee is already registered on-chain; a department-only edit never does |
| `/organizations/:orgId/employees/:employeeId/update-intent/:intentId/submit` | POST | HR | `202` — submits the signed update XDR |
| `/organizations/:orgId/employees/:employeeId/deactivate` | POST | HR | `201` — soft-delete in Postgres; response includes a `deactivate-intent` only if the employee is registered on-chain |
| `/organizations/:orgId/employees/:employeeId/deactivate-intent/:intentId/submit` | POST | HR | `202` — submits the signed deactivate XDR |
| `/organizations/:orgId/employees/import` | POST | HR | `201` — CSV upload, `?dryRun=true` for validation-only. A real commit returns one register-intent per successfully-created row (not batched — see [CSV_IMPORT.md](./CSV_IMPORT.md) §4's correction), each submitted via the same `register-intent/:intentId/submit` endpoint above |

Employee wallet-address changes are not implemented as of Step 10 — see
[EMPLOYEE_MODEL.md](./EMPLOYEE_MODEL.md) §5.

Employee intent-building/submit errors follow the same categories as
Treasury's above (`404 ORGANIZATION_NOT_FOUND`/`404 EMPLOYEE_NOT_FOUND`,
`502 SIMULATION_FAILED`, `410 INTENT_EXPIRED`, `409
INTENT_ALREADY_SUBMITTED`, `502 CHAIN_SUBMISSION_FAILED`). One addition:
any on-chain action (create/update/deactivate, not read endpoints) returns
`400 VALIDATION_ERROR` if the caller's session has no linked Stellar
wallet (`caller` in the on-chain call is always the acting user's own
`primaryWallet`, unlike Treasury's explicit body address — see
[AUTHENTICATION.md](./AUTHENTICATION.md) §3).

## Contractors

Postgres-only, no on-chain registry (docs/CONTRACTOR_MODEL.md §1-2) —
moved up from its original Step 14 slot to Step 12, since
`Milestone.contractorId` is a required FK.

| Endpoint | Method | Min role | Purpose |
|---|---|---|---|
| `/organizations/:orgId/contractors` | GET | VIEWER | List (filter by `status`) |
| `/organizations/:orgId/contractors/:contractorId` | GET | VIEWER | Detail |
| `/organizations/:orgId/contractors` | POST | HR | `201` — create |
| `/organizations/:orgId/contractors/:contractorId` | PATCH | HR | `200` — update |
| `/organizations/:orgId/contractors/:contractorId/deactivate` | POST | HR | `201` — soft-delete |

Errors: `404 CONTRACTOR_NOT_FOUND`.

## Payroll

| Endpoint | Method | Min role | Purpose |
|---|---|---|---|
| `/organizations/:orgId/payroll-runs` | GET | VIEWER | List runs |
| `/organizations/:orgId/payroll-runs` | POST | FINANCE | `201` — create a DRAFT run (explicit `employeeIds`; "all active" is a frontend convenience, not a backend special case). Rejects the whole request (`404 EMPLOYEE_NOT_FOUND` / `400 VALIDATION_ERROR`) if any selected employee isn't in this org, isn't `ACTIVE`, or has no confirmed `onChainEmployeeId` — never silently drops one |
| `/organizations/:orgId/payroll-runs/:runId` | GET | VIEWER | Detail with items |
| `/organizations/:orgId/payroll-runs/:runId/schedule` | POST | FINANCE | `201` — DRAFT -> SCHEDULED |
| `/organizations/:orgId/payroll-runs/:runId/execute-intent` | POST | FINANCE | `201` — builds and returns the *next* unexecuted chunk only (`{intentId, unsignedXdr, expiresAt, chunkIndex, totalChunks, employeeIds}`), never all chunks at once — see [PAYROLL_ENGINE.md](./PAYROLL_ENGINE.md) §2. First call transitions SCHEDULED -> EXECUTING |
| `/organizations/:orgId/payroll-runs/:runId/execute-intent/:intentId/submit` | POST | FINANCE | `202` — submits the signed chunk XDR; reconciles that chunk's items to PAID/FAILED once confirmed, and finalizes the run's status (COMPLETED/PARTIAL/FAILED) if this was the last chunk. Response includes `isLastChunk` so the caller knows whether to call `execute-intent` again |

**Example — `GET /organizations/:orgId/payroll-runs/:runId`**
Response `200`:
```json
{
  "id": "pr_123",
  "status": "PARTIAL",
  "totalAmount": "12500",
  "items": [
    { "id": "pi_1", "employeeId": "emp_1", "amount": "5000", "status": "PAID", "stellarTxHash": "abc..." },
    { "id": "pi_2", "employeeId": "emp_2", "amount": "7500", "status": "FAILED", "failureReason": "employee_inactive" }
  ]
}
```
(Decimal amounts never carry trailing zeros or a bare decimal point —
`stroopsToDecimal` strips both; `"12500"` not `"12500.0000000"`.)

Errors: `422 INSUFFICIENT_TREASURY_BALANCE` with a `shortfall` amount
(execute-intent proactively checks the *chunk's* total against the live
treasury balance before simulating, per
[PAYROLL_ENGINE.md](./PAYROLL_ENGINE.md) §3), `422
INVALID_STATE_TRANSITION` (wrong run status, or no remaining items to
execute), `404 PAYROLL_RUN_NOT_FOUND`, `502 SIMULATION_FAILED`, `502
CHAIN_SUBMISSION_FAILED`, `410 INTENT_EXPIRED`, `409
INTENT_ALREADY_SUBMITTED`.

## Milestones

`FINANCE` throughout (including for approve/cancel, documented elsewhere
as "FINANCE or ADMIN") is exactly `@MinRole("FINANCE")` — the role
hierarchy already has `ADMIN`/`OWNER` satisfy a `FINANCE` minimum, so no
separate check is needed (same note as `SMART_CONTRACT_SPECIFICATION.md`
§6 makes about the contract's own role checks).

| Endpoint | Method | Min role | Purpose |
|---|---|---|---|
| `/organizations/:orgId/milestones` | GET | VIEWER | List (filter by `status`) |
| `/organizations/:orgId/milestones/:milestoneId` | GET | VIEWER | Detail |
| `/organizations/:orgId/milestones` | POST | FINANCE | `201` — create DRAFT, Postgres-only, no chain call (docs/MILESTONE_ENGINE.md §3) |
| `/organizations/:orgId/milestones/:milestoneId/fund-intent` | POST | FINANCE | `201` — funding is two on-chain calls (`create_milestone` then `fund_milestone`) that can never be combined into one transaction (Soroban rejects >1 `InvokeHostFunction` op per tx). Always builds the *next* needed step; response includes `step: "create" \| "fund"` |
| `/organizations/:orgId/milestones/:milestoneId/fund-intent/:intentId/submit` | POST | FINANCE | `202` — submits either step's XDR (one endpoint fronts both intent types); response echoes `step` |
| `/organizations/:orgId/milestones/:milestoneId/approve-intent` | POST | FINANCE | `201` — unsigned XDR for `approve_milestone` |
| `/organizations/:orgId/milestones/:milestoneId/approve-intent/:intentId/submit` | POST | FINANCE | `202` — submit signed |
| `/organizations/:orgId/milestones/:milestoneId/release-intent` | POST | FINANCE | `201` — unsigned XDR for `release_milestone` |
| `/organizations/:orgId/milestones/:milestoneId/release-intent/:intentId/submit` | POST | FINANCE | `202` — submit signed |
| `/organizations/:orgId/milestones/:milestoneId/cancel-intent` | POST | FINANCE | `201` — Postgres-only (no `intentId`/`unsignedXdr` in the response) if the milestone was never `create_milestone`'d on-chain yet; otherwise unsigned XDR for `cancel_milestone` |
| `/organizations/:orgId/milestones/:milestoneId/cancel-intent/:intentId/submit` | POST | FINANCE | `202` — submit signed |

Errors: `404 MILESTONE_NOT_FOUND`, `404 CONTRACTOR_NOT_FOUND` (creating a
milestone for a contractor that doesn't exist), `422
INVALID_STATE_TRANSITION`, `502 SIMULATION_FAILED`, `502
CHAIN_SUBMISSION_FAILED`, `410 INTENT_EXPIRED`, `409
INTENT_ALREADY_SUBMITTED`.

## Analytics

| Endpoint | Method | Min role | Purpose |
|---|---|---|---|
| `/organizations/:id/analytics/overview` | GET | VIEWER | Headcount, treasury balance, MTD spend |
| `/organizations/:id/analytics/payroll-trends` | GET | VIEWER | Payroll cost over time (monthly buckets) |
| `/organizations/:id/analytics/treasury-flow` | GET | VIEWER | Inflow vs. outflow over time |
| `/organizations/:id/analytics/department-spend` | GET | VIEWER | Spend breakdown by department |

Step 14 implementation shapes (not otherwise specified above):

- **`overview`**: `{ headcount: number, treasuryBalance: string, monthToDateSpend: string }`.
  `treasuryBalance` is always read live from chain (same as Treasury's own
  `GET .../treasury`, never a cached column). `monthToDateSpend` sums
  `Transaction` rows since the start of the current calendar month across
  `WITHDRAWAL`/`PAYROLL_DISBURSEMENT`/`MILESTONE_FUND` — the three types
  that represent money actually leaving the treasury contract (see
  [EVENT_INDEXING.md](./EVENT_INDEXING.md) §8).
- **`payroll-trends`**: `{ month: string, totalAmount: string }[]`, one
  entry per of the trailing 6 calendar months (`"YYYY-MM"`, oldest first,
  zero-filled if empty) — summed from `COMPLETED`/`PARTIAL` `PayrollRun.totalAmount`
  bucketed by `payPeriodStart`.
- **`treasury-flow`**: `{ month: string, inflow: string, outflow: string }[]`,
  same trailing-6-month/zero-filled shape — `inflow` sums `DEPOSIT`
  transactions, `outflow` sums the same three outflow types as `overview`,
  both bucketed by `Transaction.createdAt`.
- **`department-spend`**: `{ departmentId: string | null, departmentName: string, totalAmount: string }[]`,
  summing `PAID` `PayrollItem.amount` grouped by the paying employee's
  department; employees with no department bucket under
  `{ departmentId: null, departmentName: "Unassigned" }`.

All four read Postgres directly (`overview`'s balance excepted) — none
depend on the Event Indexer having processed anything beyond what already
populates `Transaction`/`PayrollRun`/`PayrollItem` through their own
synchronous submit flows.

## Every "intent" endpoint follows the same shape

This pattern (build unsigned XDR -> client signs -> submit signed XDR) is
used everywhere a contract call moves funds or changes on-chain state, per
[BLOCKCHAIN_ARCHITECTURE.md](./BLOCKCHAIN_ARCHITECTURE.md) §5:

```
POST .../<action>-intent
  -> 201 { intentId, unsignedXdr, expiresAt }

POST .../<action>-intent/:intentId/submit
  Body: { signedXdr }
  -> 202 { status: "submitted", stellarTxHash }
  Errors: 410 INTENT_EXPIRED, 409 INTENT_ALREADY_SUBMITTED, 502 SIMULATION_FAILED
```

Intents expire after 5 minutes (configurable) to avoid stale simulations
being submitted against a since-changed contract state (e.g., treasury
balance dropped below what was simulated).
