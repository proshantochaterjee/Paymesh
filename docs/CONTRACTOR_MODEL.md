# Contractor Model

## 1. Contractors vs. employees

Contractors are **not** registered in `employee_registry` and are never
part of a `payroll_engine.run_payroll` batch. They are paid exclusively
through the `milestone_engine` flow. This reflects a real product
distinction: employees have recurring, scheduled compensation; contractors
are paid for discrete, approved deliverables.

## 2. Data model

Postgres-only entity for the contractor's identity (`fullName`, `email`,
`walletAddress`, `status`) — see `Contractor` in
[DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md). Unlike `Employee`, there is no
on-chain contractor registry contract: the contractor's wallet address is
passed directly as a parameter into `milestone_engine.create_milestone`
each time, rather than pre-registered. This is intentional — milestones
are infrequent, one-off financial events per contractor, so there's no
efficiency gain from a persistent on-chain registry the way there is for
recurring payroll (which reads the same registry every pay period).

## 3. Wallet address handling

Because the wallet is passed fresh per milestone rather than looked up
from a registry, the create-milestone form always shows the contractor's
currently-saved `walletAddress` from Postgres, pre-filled but editable at
milestone-creation time with a visible warning if changed ("this differs
from the contractor's saved wallet — update their profile?"). This
prevents a stale/incorrect wallet from silently propagating without the
Finance user noticing at the moment it matters most.

## 4. Multiple concurrent milestones

A contractor can have any number of milestones in any (independent)
state simultaneously — there is no on-chain contractor-level state to
serialize, since each `Milestone` is fully independent
(`(org_id, milestone_id)` keyed, no contractor-level aggregate on-chain).
The Contractor detail page in the UI aggregates this off-chain for display
(total paid to date, open milestone value) purely from Postgres.

## 5. Deactivation

Soft delete (`status: INACTIVE`), same rationale as
[EMPLOYEE_MODEL.md](./EMPLOYEE_MODEL.md) §6 — preserves referential
integrity for historical `Milestone` records and audit trail.

## 6. Future extension point (not built in MVP)

If a future version needs recurring contractor retainers (as opposed to
one-off milestones), the natural design is a `retainer_registry` contract
parallel to `employee_registry` — noted here only to confirm the current
per-milestone wallet-passing design doesn't block that extension; it would
be purely additive.
