# System Architecture

## 1. High-level component diagram

```
                                   ┌─────────────────────────┐
                                   │   Stellar Testnet        │
                                   │  ┌───────────────────┐  │
                                   │  │ payroll_factory    │  │
                                   │  │ organization (xN)  │  │
                                   │  │ treasury (xN)       │  │
                                   │  │ employee_registry   │  │
                                   │  │ payroll_engine      │  │
                                   │  │ milestone_engine    │  │
                                   │  │ USDC SAC token      │  │
                                   │  └───────────────────┘  │
                                   └───────────┬─────────────┘
                                               │ Stellar RPC / Horizon
                          submit tx            │  read ledger + events
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
                    ▼                          ▼                          │
          ┌───────────────────┐     ┌────────────────────┐               │
          │  Browser wallet    │     │  Event Indexer      │              │
          │  (Freighter)       │     │  (NestJS worker)     │─────────────┘
          │  signs tx           │     │  polls ledger,       │
          └─────────┬──────────┘     │  writes Transaction   │
                    │  signed tx      │  rows                 │
                    │                └──────────┬────────────┘
                    │                            │
                    ▼                            ▼
          ┌────────────────────────────────────────────────┐
          │              Backend API (NestJS)                │
          │  auth · organizations · treasury · employees      │
          │  contractors · payroll · milestones · analytics   │
          │  builds unsigned XDR tx, never holds keys          │
          └───────────────────┬──────────────────────────────┘
                              │ REST (JSON) over HTTPS
                              ▼
          ┌────────────────────────────────────────────────┐
          │            Frontend (Next.js 15, App Router)      │
          │  Dashboard · Treasury · Employees · Contractors    │
          │  Payroll · Milestones · Transactions · Analytics    │
          │  TanStack Query cache · Zustand UI state             │
          └────────────────────────────────────────────────┘
                              ▲
                              │
                    ┌───────────────────┐
                    │  PostgreSQL         │
                    │  (via Prisma, from   │
                    │   the backend only)  │
                    └───────────────────┘
```

## 2. Component responsibilities

| Component | Owns | Never does |
|---|---|---|
| Soroban contracts | Custody and movement of USDC; authorization rules for who can move it; on-chain event emission | Store PII; make UX decisions |
| Event Indexer | Polling Stellar RPC for new ledgers/events from the six contract addresses; writing normalized `Transaction` rows; tracking `IndexerCursor` per contract | Author transactions; hold keys |
| Backend API (NestJS) | Auth, org/employee/contractor CRUD, building unsigned transaction XDR for the client to sign, exposing read APIs backed by Postgres + indexed chain data | Sign or submit transactions on a user's behalf; hold treasury private keys |
| PostgreSQL | Organizational data, RBAC, audit log, indexed chain-event projection | Represent itself as the source of truth for "is this payment final" — that's the chain |
| Frontend (Next.js) | All user interaction, wallet connection, transaction signing UI, dashboards | Talk to Postgres directly; talk to Stellar RPC for anything the backend already exposes (single source of truth for reads is the backend API) |
| Wallet (Freighter) | Holds the user's/org's Stellar keypair; signs transactions | Anything outside signing — it is not part of this codebase |

## 3. Data flow: "run payroll" (illustrative, full detail in SEQUENCE_DIAGRAMS.md)

1. Finance user opens Payroll page, creates a `PayrollRun` (backend writes
   `DRAFT` row in Postgres, no chain interaction yet).
2. User reviews the computed total and clicks Execute.
3. Backend builds an unsigned Soroban transaction invoking
   `payroll_engine.run_payroll(org_id, run_id, employee_ids)` and returns
   the XDR to the frontend.
4. Frontend asks the connected wallet (org's Finance/Admin signer) to sign;
   signed XDR is submitted back to the backend (or submitted directly to
   Stellar RPC from the client — see
   [BLOCKCHAIN_ARCHITECTURE.md](./BLOCKCHAIN_ARCHITECTURE.md) §5 for the
   chosen approach and its trade-offs).
5. Stellar network executes the contract call; `payroll_engine` calls
   `treasury.transfer_out` per employee, emitting `PayrollItemPaid` events.
6. The Event Indexer picks up the new ledger, writes `Transaction` and
   updates `PayrollItem`/`PayrollRun` status to `COMPLETED`/`PARTIAL`/`FAILED`.
7. Frontend's TanStack Query cache is invalidated (via polling or a
   short-lived subscription) and the UI reflects the settled state.

## 4. Deployment topology

- **Frontend**: Vercel, one project, environment-per-branch previews.
- **Backend**: Railway or Render, one service for the API, one worker
  service (or scheduled job) for the Event Indexer, sharing the same
  Postgres instance.
- **Database**: managed PostgreSQL (Railway/Render-provided for MVP).
- **Contracts**: deployed to Stellar Testnet via `soroban-cli`/Stellar CLI
  from CI on tag, contract IDs recorded in
  [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).

Full rationale for each stack choice is in
[TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md).

## 5. Cross-cutting concerns

- **Idempotency**: payroll runs and milestone operations carry
  client-generated idempotency keys at the API layer and on-chain nonces
  (`run_id`, `milestone_id`) at the contract layer, so retried requests
  cannot double-pay. See [PAYROLL_ENGINE.md](./PAYROLL_ENGINE.md) and
  [MILESTONE_ENGINE.md](./MILESTONE_ENGINE.md).
- **Eventual consistency**: the UI must visually distinguish "submitted",
  "confirmed on-chain", and "indexed" states rather than assuming
  submission implies settlement.
- **Observability**: structured logs from backend and indexer, correlated
  by a request/trace ID, per [LOGGING.md](./LOGGING.md).
