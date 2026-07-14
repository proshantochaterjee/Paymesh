# Employee Model

## 1. Split representation

| Field | Lives in | Why |
|---|---|---|
| Name, email, department | Postgres `Employee` only | PII, never belongs on a public ledger |
| Wallet address, salary, currency, pay frequency, active flag | Both Postgres `Employee` (human-editable, cached) **and** on-chain `employee_registry` (authoritative for payroll authorization) | Payroll needs an on-chain source of truth for "who gets paid what" that a compromised backend can't unilaterally alter without a valid signature |
| `onChainEmployeeId` | Postgres, foreign key into the on-chain record | Links the two representations |

## 2. Why PII stays off-chain

Stellar Testnet (and any Stellar network) is a public, permanent ledger.
Writing a name or email on-chain would make it permanently public and
undeletable, incompatible with basic data-protection expectations (and,
for a real deployment, likely GDPR/CCPA obligations). The on-chain record
is deliberately minimal: exactly what `payroll_engine` needs to compute
and authorize a payment, nothing a person would recognize as "about them."

## 3. Two-phase creation

Creating an employee is two operations that must both succeed for the
employee to be fully "active," but can be in a temporarily inconsistent
state:

1. `POST /employees` writes the Postgres row **and** builds the
   `employee_registry.register_employee` unsigned XDR in one response
   (`{employee, intentId, unsignedXdr, expiresAt}`) — confirmed in Step 10:
   unlike a treasury deposit (a separate, repeatable action), registering
   is not optional follow-up, every employee creation needs it, so there's
   no reason to make it a second round trip. `onChainEmployeeId` is `NULL`
   at this point ("pending"); there's no separate persisted
   `registrationStatus` column, its absence/presence is the status.
2. The client gets the HR user's wallet signature on that XDR and calls
   `POST /employees/:employeeId/register-intent/:intentId/submit`; once
   the transaction confirms, the backend backfills `onChainEmployeeId`
   (polling the transaction result server-side after submit, rather than
   waiting for the Event Indexer, since Step 13 doesn't exist yet and
   every employee needs this to become payroll-eligible, not just
   eventually-consistent history — see
   [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md)'s Step 10 entry).

If step 2 fails or is abandoned (wallet rejected, browser closed), the
employee row exists with `onChainEmployeeId = NULL` and the UI shows a
"Registration incomplete — Retry" state instead of silently treating the
employee as payroll-eligible. **`payroll_engine`/the payroll run creation
UI both explicitly exclude any employee without a confirmed
`onChainEmployeeId`** from being selectable in a payroll run — this is the
concrete mechanism preventing "looks active in the DB but isn't actually
payable on-chain" from causing a failed payroll item.

## 4. Updating salary/frequency

Same two-phase pattern: `PATCH /employees/:employeeId` updates Postgres
optimistically and, only when `salaryAmount`/`payFrequency` actually
change **and** the employee already has a confirmed `onChainEmployeeId`,
also returns an `update-intent` in the same response (submitted via
`POST .../update-intent/:intentId/submit`) — `update_employee` has no
matching on-chain record to update if registration is still pending, so
in that case the edit is Postgres-only (the pending register-intent, once
submitted, will register with whatever was in Postgres at the time
`POST /employees` originally built it — an edit made in between isn't
retroactively reflected in that already-built XDR; logged as follow-up
debt in [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md), not solved in Step
10). A department-only `PATCH` never builds an intent (§7: purely
off-chain). Regardless of any of this, a payroll run always uses the
**on-chain** salary value at execution time (read fresh via
`employee_registry.get_employee` during `run_payroll` simulation), not
whatever's cached in Postgres — so a Postgres-only edit that never got
confirmed on-chain cannot silently under/overpay someone.

## 5. Changing a wallet address

Not a simple field edit: the contract's `update_employee` has no wallet
parameter at all (verified against `packages/contracts/employee-registry/src/lib.rs`
— it only takes `salary`/`frequency`), so there is no on-chain path to
directly change a registered wallet. Changing a wallet address is **not
implemented as of Step 10** — `PATCH /employees/:employeeId` only accepts
`salaryAmount`/`payFrequency`/`departmentId`. The eventual mechanism would
need to deactivate the old on-chain registration and register a new one
(a new `employee_id`), re-running the same HR/Admin-signed authorization
flow as creation rather than a silent DB-only update, precisely because
payee destination is the single most security-sensitive field on this
entity — see [THREAT_MODEL.md](./THREAT_MODEL.md) §4's accepted-risk note
on this exact scenario. Logged as open scope for whichever step first
needs it.

## 6. Deactivation

Soft delete only (`status: INACTIVE` in Postgres, `active: false`
on-chain via `deactivate_employee`). Deactivated employees:
- Are excluded from `list_active_employee_ids` and any default payroll-run
  employee selection.
- Remain visible in historical `PayrollItem` records (referential
  integrity — see `onDelete: Restrict` in
  [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)).
- Can be reactivated (HR action), which does not require re-registration
  on-chain since the registry record still exists, just flips `active`
  back to `true`.

## 7. Departments

Purely organizational (off-chain only) — `Department` has no on-chain
representation. Used for analytics grouping and payroll preview
breakdowns only.
