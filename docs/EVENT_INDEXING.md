# Event Indexing

## 1. Purpose

The Event Indexer is a NestJS worker process that reads Soroban contract
events from Stellar RPC and materializes them into the Postgres
`Transaction` table (and status updates on `PayrollRun`/`PayrollItem`/
`Milestone`), so the frontend and API never need to query Stellar RPC
directly for lists/history and the UI has one consistent, queryable
representation of "what happened on-chain."

## 2. What it watches

The six deployed contract addresses:
`payroll_factory`, every deployed `organization`/`treasury` pair (loaded
dynamically from the `Organization` table, not hardcoded), `employee_registry`,
`payroll_engine`, `milestone_engine`.

Relevant events (topics defined once in the `common` Rust crate and
mirrored as TypeScript constants in `packages/shared` so both sides agree
on topic names byte-for-byte):

| Event | Contract | Resulting DB effect |
|---|---|---|
| `org_created` | payroll_factory | none (org row is created synchronously by the API on successful submission, not by the indexer — the indexer only reconciles/alerts on mismatch) |
| `deposited` | treasury | Insert `Transaction(type=DEPOSIT, status=CONFIRMED)` |
| `withdrawn` | treasury | Insert `Transaction(type=WITHDRAWAL)` |
| `transferred_out` (reason=payroll) | treasury | Insert `Transaction(type=PAYROLL_DISBURSEMENT)` |
| `transferred_out` (reason=milestone_fund) | treasury | Insert `Transaction(type=MILESTONE_FUND)` |
| `payroll_item_paid` / `payroll_item_failed` | payroll_engine | Update matching `PayrollItem.status`/`stellarTxHash`/`failureReason` |
| `payroll_run_completed` | payroll_engine | Update `PayrollRun.status` (COMPLETED/PARTIAL/FAILED) from aggregated item statuses |
| `milestone_funded`/`approved`/`released`/`cancelled` | milestone_engine | Update `Milestone.status`, insert `Transaction` for funded/released |

## 3. Polling model

- Interval-based polling (default every 5 seconds) via a BullMQ repeatable
  job, not a persistent streaming subscription — simpler operationally for
  MVP and Soroban RPC's `getEvents` is a pull API.
- Per contract address, the indexer calls `getEvents(startLedger, filters)`
  where `startLedger` is `IndexerCursor.lastLedgerSequence + 1`, processes
  all returned events in ledger order, and updates the cursor only after a
  batch is fully and successfully processed (at-least-once processing —
  see idempotency below).
- On worker restart, indexing resumes from the last persisted cursor per
  contract; no events are skipped.

## 4. Idempotency

Every DB write from the indexer is an upsert keyed by
`stellarTxHash` (+ event index within the transaction, for
transactions with multiple relevant events, e.g., a payroll batch
emitting many `payroll_item_paid` events in one transaction) so
reprocessing the same ledger range (e.g., after a crash before the cursor
was persisted) never creates duplicate `Transaction` rows.

## 5. Ledger reorgs

Stellar's consensus model does not produce the kind of deep reorgs common
in probabilistic-finality chains; the indexer waits for RPC-reported
"finalized" ledgers only (not tentative/optimistic results) before
writing, so no reorg-handling/rollback logic is needed for MVP.

## 6. Failure handling

- A single malformed/unrecognized event is logged at `warn` and skipped
  (does not block the rest of the batch) — this can happen if a contract
  address returns an event from a topic not in our known set (e.g., future
  version skew), and should never crash the indexer loop.
- Repeated RPC failures trigger BullMQ's built-in exponential backoff
  retry; after N failures (configurable), an `error`-level log is emitted
  for the treasury reconciliation job (see
  [TREASURY_ARCHITECTURE.md](./TREASURY_ARCHITECTURE.md) §7) to surface
  eventually.

## 7. Testing strategy

Integration tests run the indexer against a local Stellar Testnet/Futurenet
sandbox (or recorded RPC fixtures) covering: cursor advancement, upsert
idempotency on reprocessing, correct status derivation for a `PARTIAL`
payroll run from mixed paid/failed item events, and unknown-event
tolerance.

## 8. Step 13 implementation notes (corrections against the design above)

- **`Transaction` idempotency key changed**: §4 said "keyed by
  `stellarTxHash` (+ event index within the transaction)" — in practice a
  single `run_payroll` transaction paying several employees emits one
  `transferred_out` event *per employee*, so `stellarTxHash` alone can
  never be `@unique` (it was, through Step 12, since nothing had written
  more than one `Transaction` row per hash yet). Soroban RPC's own event
  `id` (e.g. `"0015456977412984832-0000000001"`) is already a global,
  stable per-event identifier, so that's the real upsert key now
  (`Transaction.stellarEventId`, migration `20260714070000_transaction_event_id`);
  `stellarTxHash` is a plain indexed column.
- **`transferred_out(reason=milestone_fund)` vs `milestone_engine`'s own
  events, resolved as one insert, not two**: §2's table lists *both*
  treasury's `transferred_out` and `milestone_engine`'s
  `milestone_funded`/`released` as "insert Transaction" — literally
  implementing both would double-count the same fund movement (they
  co-occur in one transaction). Treasury's events are the sole source of
  `Transaction` rows (money-movement is inherently treasury's job);
  `milestone_engine`'s own events only update `Milestone.status`.
- **`payroll_item_paid`/`payroll_item_failed`/`payroll_run_completed`: no
  DB effect implemented this step**, despite §2's table. Each chunk's
  on-chain `run_id` is `SHA256(PayrollRun.id, chunkIndex)` — a one-way
  hash (see `run-id.util.ts`) with no persisted reverse mapping, so an
  event carrying only `run_id` can't be resolved back to a Postgres
  `PayrollRun`/`PayrollItem` without additional plumbing (persisting the
  hash at intent-build time) not in scope this step. Not a silent gap:
  Payroll's own synchronous confirmation-polling (`reconcileChunk`, Step
  11) already reconciles this state and remains the sole source of truth
  for payroll status; the indexer logs these at `debug` and moves on.
  Follow-up: persist the `(run_id) -> (payrollRunId, chunkIndex)` mapping
  at build time so the indexer can pick this up too.
- **Milestone status reconciliation is a redundant safety net, not new
  capability**: `Milestone.onChainMilestoneId` is a real sequential
  per-org counter (unlike payroll's hashed `run_id`), already backfilled
  synchronously when a milestone is created (Step 12), so
  `milestone_funded`/`approved`/`released`/`cancelled` events *are*
  resolvable and update `Milestone.status` by `(organizationId,
  onChainMilestoneId)`. Milestones' own synchronous
  `waitForConfirmedSuccess`-based reconciliation already does this same
  update — the indexer's version is a belt-and-suspenders recovery path
  if that synchronous path ever missed, not the primary mechanism.
- **A real Testnet RPC quirk, found writing `organizations.e2e-spec.ts`'s
  companion `indexer.e2e-spec.ts`**: `getLatestLedger()` (consensus) can
  report a ledger sequence the RPC node's own `getEvents` indexing
  frontier hasn't caught up to yet — a cursor freshly baselined at
  "current ledger" can hit `-32600 "startLedger must be within the ledger
  range"` on its very next poll. Treated as "nothing new yet," not a
  failure (`IndexerService.pollContract`'s `isLedgerNotYetIndexedError`
  check) — logged at `debug`/skipped rather than the `error` level a
  genuine RPC outage gets.
- **No historical backfill for a brand-new contract**: a cursor-less
  contract (first time the indexer has ever seen it) baselines at the
  *current* ledger and starts picking up events from the next poll
  onward — a pre-existing organization's history before the indexer
  first ran against it is never backfilled. Documented as a known MVP
  limitation, not silently assumed; verified directly in
  `indexer.e2e-spec.ts` (the test seeds the cursor one ledger early,
  specifically to get around this and exercise real event processing).
- Verified: a real deposit against a real deployed `treasury` contract,
  materialized into a `Transaction` row by a real `IndexerService.pollAll()`
  call (not simulated), including idempotency on cursor rewind/reprocessing.
  10 `indexer.service.spec.ts` unit tests plus this one real end-to-end run.
