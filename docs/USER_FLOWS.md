# User Flows

Narrative flows; corresponding technical sequence diagrams are in
[SEQUENCE_DIAGRAMS.md](./SEQUENCE_DIAGRAMS.md) and screen layouts in
[WIREFRAMES.md](./WIREFRAMES.md).

## 1. Organization onboarding (Owner)

1. Register (email/password) or sign in with wallet.
2. Prompted to create an organization: enter name.
3. Backend deploys `organization` + `treasury` contracts, org appears with
   zero balance.
4. Prompted to connect a treasury wallet and make an initial deposit
   (skippable — org can exist funded later).
5. Redirected to `/org/[orgId]/dashboard`, empty states everywhere
   (no employees, no payroll history) each with a clear next-action CTA.

## 2. Inviting a team member

1. Owner/Admin goes to Settings → Members → Invite.
2. Enters email + selects role (Admin/Finance/HR/Viewer).
3. Backend creates a pending `OrganizationMember` (MVP: invitee must
   already have or create a WorkforceOS account and accept — no email
   delivery in MVP per the "no notifications" boundary, so the invite link
   is copy/shareable manually).
4. On acceptance, `organization.grant_role` is called on-chain, membership
   becomes active.

## 3. Adding an employee (single)

1. HR/Admin → Employees → Add Employee.
2. Form: name, email, wallet address (validated as a well-formed Stellar
   `G...` address), department, salary amount, pay frequency.
3. Submit → backend creates `Employee` row (`status: ACTIVE`) → builds and
   requires a wallet signature for `employee_registry.register_employee`
   (signed by an Admin/HR-role wallet) → on confirmation, `onChainEmployeeId`
   is backfilled onto the row.
4. If the on-chain call fails after the DB write, the employee shows a
   "Registration pending — retry" state rather than disappearing; see
   [EMPLOYEE_MODEL.md](./EMPLOYEE_MODEL.md) §"Two-phase creation."

## 4. Bulk employee import (CSV)

1. HR → Employees → Import CSV → upload file.
2. Dry-run validation shows a per-row preview: valid rows, and errors
   (bad wallet address, missing required field, duplicate email) inline
   next to the offending row.
3. HR fixes the file or excludes bad rows, confirms import.
4. Valid rows are created as `Employee` rows, then registered on-chain in
   a single batched signing flow (one wallet signature can cover multiple
   `register_employee` calls if built as one transaction with multiple
   operations, subject to Soroban resource limits — chunked like payroll
   if needed). See [CSV_IMPORT.md](./CSV_IMPORT.md).

## 5. Running payroll

1. Finance → Payroll → New Run.
2. Select pay period + employee set (default: all active).
3. Preview shows total cost, per-department breakdown, and current
   treasury balance side by side, flags insufficient-balance up front.
4. Finance clicks Schedule (or Execute Now).
5. Execute triggers the signing flow (per chunk if needed), progress shown
   per chunk ("Processing batch 1 of 3...").
6. Result view shows per-employee status; any `FAILED` items link directly
   to "Create a follow-up run for failed items."

## 6. Contractor milestone payment

1. HR/Finance → Contractors → add contractor (name, email, wallet).
2. Finance → Milestones → New Milestone: select contractor, title,
   amount.
3. Finance clicks Fund → signs `fund_milestone` → milestone shows
   `FUNDED`, amount now shown as escrowed in the Treasury Dashboard's
   pending obligations.
4. Once deliverable is confirmed (off-platform), Finance/Admin clicks
   Approve → signs `approve_milestone`.
5. Finance clicks Release → signs `release_milestone` → contractor
   receives funds, milestone shows `RELEASED` with a link to the Stellar
   transaction.

## 7. Viewing transaction history

1. Any Viewer+ role → Transactions.
2. Filterable list (type, status, date range), each row links out to
   Stellar Expert (Testnet) via `stellarTxHash`.
3. Clicking a row tied to a `PayrollRun` or `Milestone` deep-links to that
   entity's detail page.

## 8. Analytics review

1. Any Viewer+ role → Analytics.
2. Overview cards: current treasury balance, active headcount, MTD
   payroll spend, open milestone value.
3. Charts: payroll cost trend (monthly), treasury inflow/outflow, spend by
   department, milestone completion rate — all driven by the analytics API
   endpoints in [API_SPECIFICATION.md](./API_SPECIFICATION.md).
