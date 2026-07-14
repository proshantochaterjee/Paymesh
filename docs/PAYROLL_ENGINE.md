# Payroll Engine

Product/operational detail for payroll. Contract interface is in
[SMART_CONTRACT_SPECIFICATION.md](./SMART_CONTRACT_SPECIFICATION.md) §5.

## 1. Payroll run lifecycle (off-chain + on-chain combined)

```
DRAFT -> SCHEDULED -> EXECUTING -> COMPLETED
                                 -> PARTIAL   (some items failed on-chain)
                                 -> FAILED    (transaction itself reverted/never confirmed)
```

- **DRAFT**: Finance selects a pay period and either "all active
  employees" or an explicit subset; backend computes a `PayrollItem` per
  employee from `Employee.salaryAmount` at creation time (a snapshot —
  later salary changes don't retroactively affect an existing run).
- **SCHEDULED**: Finance confirms the preview; run is queued with a target
  execution date. No on-chain interaction yet.
- **EXECUTING**: Finance (or, for a scheduled date, an automated trigger
  requiring a pre-authorized signer — out of MVP scope; MVP requires a
  human to click Execute) builds and submits the on-chain transaction(s).
- **COMPLETED / PARTIAL / FAILED**: derived from the Event Indexer's view
  of `payroll_run_completed`/`payroll_item_paid`/`payroll_item_failed`
  events, reconciled onto `PayrollRun`/`PayrollItem` rows.

## 2. Batching

Soroban transactions have resource limits (instructions, read/write
entries, transaction size). A payroll run with more employees than fit in
one transaction's budget is split into **chunks** by the backend before
submission:

- Chunk size is a backend-configurable constant (`PAYROLL_CHUNK_SIZE`).
  **Benchmarked in Step 11** against the real deployed contracts (not
  simulation alone — see the methodology note below): with real, funded,
  trustlined employee wallets, `run_payroll` actually submitted and
  confirmed successfully up to **10** employees in one transaction; 11
  failed simulation with `Memory(OutOfBoundsGrowth)`. `PAYROLL_CHUNK_SIZE`
  is set to **8**, two below the confirmed ceiling, as safety margin for
  employee data this benchmark didn't vary (all test employees used
  identical simple values).
  - **Methodology note, in case this needs re-benchmarking later**: the
    first benchmarking attempt used *simulation-only* checks against
    employees with random, unfunded, non-trustlined wallets, and got
    wildly misleading results (`Budget, ExceededLimit` failing at just 10
    items, with headroom on raw CPU instructions). Root cause: an
    employee whose wallet can't actually receive the payment causes
    `treasury.transfer_out`'s inner SAC transfer to trap, and Soroban's
    simulated resource *estimate* for that trap-and-recover code path
    doesn't reliably match its real execution cost — so simulating a
    batch of *failing* payments is not a valid proxy for benchmarking a
    batch of *succeeding* ones. The real number above came from actually
    registering employees with funded, trustlined wallets and physically
    submitting (not just simulating) `run_payroll` at increasing sizes.
- Each chunk gets its own `run_id` derived as `${payrollRun.id}-${chunkIndex}`
  hashed to a `u64` for the contract call, so `payroll_engine`'s
  per-`run_id` idempotency guard applies per chunk, not per whole run.
- `PayrollRun.status` aggregates across all of its chunks: `COMPLETED`
  only if every chunk's every item succeeded; `PARTIAL` if any item in any
  chunk failed or any chunk itself failed after at least one chunk
  succeeded; `FAILED` if every chunk failed.
- Chunks execute sequentially, not in parallel, so a systemic failure
  (e.g., treasury underfunded) is discovered after the first chunk rather
  than after firing all chunks concurrently and wasting fees on doomed
  transactions.

## 3. Insufficient treasury balance

Before building the execution transaction, the backend simulates
`payroll_engine.run_payroll` via RPC and independently checks
`treasury.get_balance() >= sum(chunk amounts)`. If insufficient, the API
returns a `422` with the shortfall amount rather than submitting a
transaction destined to fail on a subset of items — Finance is shown
"fund treasury with at least $X more before running payroll" instead of a
confusing partial-failure result caused purely by running out of money
mid-batch.

## 4. Retrying failed items

A `PARTIAL` run's failed `PayrollItem`s can be selected into a **new**
payroll run (a normal `DRAFT` creation pre-filled with just those
employees) — there is no "retry the same run" operation, because the
original `run_id`(s) that succeeded are permanently consumed on-chain and
a clean new run keeps the audit trail unambiguous (two distinct runs, each
fully accounted for, rather than a mutated original run).

## 5. Off-chain payroll cost preview

The DRAFT preview screen computes total cost, per-department breakdown,
and flags any employee whose `Employee.status` is not `ACTIVE` (excluded
automatically, shown as an informational note) purely from Postgres —
no chain call is needed until execution, keeping the preview instant.

## 6. Audit trail

Every transition (`DRAFT` created, `SCHEDULED`, `EXECUTING` started, final
status) writes an `AuditLog` row with the acting user, and every
`PayrollItem`'s final state stores its `stellarTxHash` for independent
verification on Stellar Expert / Stellar.Expert Testnet explorer links
rendered directly in the UI.
