# Milestone Engine

Product/operational detail for contractor milestone payments. Contract
interface is in
[SMART_CONTRACT_SPECIFICATION.md](./SMART_CONTRACT_SPECIFICATION.md) §6.

## 1. Why a separate approve step from release

Splitting `approve_milestone` from `release_milestone` (both require
Finance-tier authority, but are separate transactions) exists so an
organization can implement a two-person or two-moment control without the
contract needing to know about org-specific process: e.g., a PM confirms
the deliverable was received (`approve`) and Finance independently
executes payment (`release`) at a later time, possibly batched with other
releases. MVP does not enforce "different person for approve vs release"
on-chain (both just require Finance role) — orgs that want that discipline
enforce it by convention/off-chain process for now; a stricter two-signer
rule is a natural post-MVP enhancement to `organization`'s role model, not
a milestone-engine change.

## 2. State machine (canonical)

```
DRAFT --fund--> FUNDED --approve--> APPROVED --release--> RELEASED
  |                |
  +--cancel--------+--cancel--> CANCELLED (refund if FUNDED, no-op if DRAFT)
```

`APPROVED` and `RELEASED` have no cancel path (see contract spec's
Security considerations) — resolving a mistakenly-approved milestone that
should not be released is an operational conversation between the org and
contractor, not a contract-level cancel, since the funds are already
one authorization step away from being contractually "confirmed."

## 3. Off-chain Milestone entity vs on-chain MilestoneRecord

Postgres `Milestone` stores the human-facing detail (title, description,
due date, linked contractor's off-chain profile) and mirrors `status` and
`onChainMilestoneId`/`stellarTxHash`. Creating a milestone in the UI
writes the Postgres row first (`DRAFT`, no `onChainMilestoneId` yet, no
chain call at all) so a title/description can be drafted and edited
freely before anything touches the chain.

**Confirmed in Step 12**: when the org clicks "Fund," `create_milestone`
and `fund_milestone` cannot be combined into one transaction — Soroban
rejects more than one `InvokeHostFunction` operation per transaction
(the same constraint discovered for CSV import's batch registration in
Step 10). `POST fund-intent` therefore builds exactly one of the two
calls per request — `create_milestone` if `onChainMilestoneId` is still
null, else `fund_milestone` — and the response's `step` field tells the
caller which one it just got, so the UI calls `fund-intent` again after
submitting to get the other step. The `milestone_id` returned by
`create_milestone`'s confirmation is stored back onto the Postgres row
before the UI is offered the `fund_milestone` step.

## 4. Partial milestones / installments

Not supported in MVP — a milestone is a single amount, single release. An
engagement with multiple deliverables is modeled as multiple `Milestone`
rows, each independently funded/approved/released. This keeps the state
machine and contract simple and matches the "no streaming/vesting" MVP
boundary.

## 5. Escrow visibility

The Treasury Dashboard's "pending obligations" figure (see
[TREASURY_ARCHITECTURE.md](./TREASURY_ARCHITECTURE.md) §3) includes all
`FUNDED`/`APPROVED` milestones so an org can see money that has left their
treasury balance but not yet reached a contractor.

## 6. Audit trail

Every transition writes an `AuditLog` row; `Transaction` rows are written
by the Event Indexer for `milestone_funded` (type `MILESTONE_FUND`) and
`milestone_released` (type `MILESTONE_RELEASE`) so a contractor payment
has the same on-chain-verifiable trail as a payroll disbursement.
