# Treasury Architecture

This document covers the product/operational view of treasury management.
For the contract-level interface, see
[SMART_CONTRACT_SPECIFICATION.md](./SMART_CONTRACT_SPECIFICATION.md) §3
(`treasury`).

## 1. Lifecycle

1. **Provisioning**: created automatically alongside `organization` when
   `payroll_factory.create_organization` runs — an org can never exist
   without exactly one treasury.
2. **Funding**: the Org Owner connects a Stellar wallet (Freighter) holding
   Testnet USDC and calls deposit from the Treasury page. Deposits are
   permissionless at the contract level (anyone can top up an org's
   treasury) but the UI only exposes this to Owner/Admin/Finance roles.
3. **Operation**: Finance-role users trigger payroll runs and milestone
   funding, both of which pull from this balance via `payroll_engine` /
   `milestone_engine`.
4. **Manual withdrawal**: Admin/Owner can withdraw directly (e.g., to
   return unused funds), always logged to `AuditLog`.

## 2. Balance model

The **displayed balance** in the UI is read live from
`treasury.get_balance()` (which reads the USDC SAC token contract) on page
load and after any mutating action, via `packages/sdk`. It is never read
from a cached Postgres column — Postgres's `Transaction` table is used for
**history and analytics**, not for the current balance figure, to avoid
ever showing a stale number as authoritative.

## 3. Pending obligations

The Treasury Dashboard additionally surfaces a **computed, off-chain**
"committed" figure: the sum of (a) all `PayrollRun`s in `SCHEDULED` status
not yet executed, and (b) all `Milestone`s in `FUNDED` or `APPROVED` status
(already escrowed, not yet released — technically already moved out of the
treasury on-chain, but still worth surfacing as "this org's" money in
flight). This is clearly labeled as an off-chain projection, not an
on-chain balance.

## 4. Deposit flow (detail)

1. Frontend: user enters amount, clicks Deposit.
2. Backend `POST /organizations/:orgId/treasury/deposit-intent` returns
   unsigned XDR calling `treasury.deposit(from: userWallet, amount)` —
   simulated first, so a call that would fail on-chain (e.g. `from` has no
   trustline to the USDC SAC) returns `502 SIMULATION_FAILED` immediately
   instead of unsigned XDR the wallet would sign for nothing.
3. Wallet signs; frontend posts signed XDR to
   `POST /organizations/:orgId/treasury/deposit-intent/:intentId/submit`.
4. Backend submits, returns `{status: "submitted", stellarTxHash}`
   immediately (Step 9: implemented exactly this far — no `Transaction`
   row is written yet, since that's the Event Indexer's job and it doesn't
   exist until Step 13; the live balance read in §2 is unaffected since it
   never depended on that row).
5. Event Indexer (Step 13) observes the `deposited` event, writes a
   `Transaction` row with `type: DEPOSIT`, `status: CONFIRMED`.
6. Frontend polls/query-invalidates until the matching `Transaction` shows
   `CONFIRMED`, then updates the balance display.

## 5. Withdrawal flow

Same shape as deposit but calling `treasury.withdraw`, restricted to
Admin/Owner at the API authorization layer (see
[PERMISSION_MODEL.md](./PERMISSION_MODEL.md)) in addition to the
contract-level role check — defense in depth, not reliance on the UI/API
alone.

## 6. Multi-organization treasuries

A user can belong to multiple organizations (`OrganizationMember` is a
many-to-many join); the currently-active org is tracked in Zustand
client-side state and included as a route param (`/org/[orgId]/treasury`)
so treasury data is always fetched for an explicit, unambiguous org — there
is no implicit "current org" server-side session state that could leak
data across orgs on a client bug.

## 7. Reconciliation

A scheduled backend job (BullMQ, hourly) re-reads `treasury.get_balance()`
for every active org and compares it against the sum of indexed
`Transaction` rows (deposits minus withdrawals minus payroll minus
milestone-funding), alerting (log-level `error`, no external notification
in MVP) on any mismatch — this is a correctness safety net for the indexer,
not a source of truth substitution.
