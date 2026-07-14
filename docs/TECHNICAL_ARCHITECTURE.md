# Technical Architecture

This document records stack decisions and the trade-offs considered. It is
the reference for "why did we pick X" so the choice isn't re-litigated
mid-implementation.

## 1. Monorepo tooling: Turborepo

**Chosen: Turborepo** with npm/pnpm workspaces.

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Turborepo | Zero-config task graph, remote caching, minimal YAML, first-class Next.js/Vercel integration | Less powerful dependency-graph tooling than Nx | Chosen — this project's monorepo is shallow (3 app-ish targets, few packages); we don't need Nx's generators/plugins |
| Nx | Very powerful graph, generators, plugin ecosystem | Heavier config, steeper learning curve, overkill for this repo's size | Rejected for MVP scope |
| Plain npm workspaces, no task runner | Simplest possible | No caching, no task orchestration across `apps/*`/`packages/*` | Rejected — CI would be slower and scripts would duplicate logic |

`packages/contracts` is a separate **Cargo workspace** (Rust/Soroban is
not part of the JS task graph); Turborepo only orchestrates
`apps/*`/`packages/{shared,sdk}` JS/TS builds, plus a thin `turbo.json`
task that shells out to `cargo` for contract build/test so `turbo run
build`/`turbo run test` still cover everything from one command.

## 2. Backend framework: NestJS

**Chosen: NestJS** over Next.js API routes (per the master spec's stated
preference, confirmed as the working decision).

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| NestJS | Explicit module/DI boundaries map directly to Clean Architecture and DDD; first-class testing story; decorator-based validation; scales to a dedicated Event Indexer worker process sharing code with the API | Separate deployable from the frontend; more initial boilerplate | Chosen — this project's "backend must never own funds, must be independently deployable" requirement is much easier to enforce with a fully separate service |
| Next.js API routes | Single deployable, simpler infra | Blurs frontend/backend boundary; harder to run a long-lived indexer worker in the same process; less natural DDD module structure | Rejected |

## 3. ORM: Prisma

Chosen for schema-first migrations, generated types shared into
`packages/shared`, and first-class Postgres support. Alternative
(Drizzle) considered for lighter runtime, but Prisma's migration tooling
and NestJS integration ecosystem (`nestjs-prisma`) win for a team-scale
project prioritizing velocity and readability over micro-optimized query
control.

## 4. Frontend: Next.js 15 App Router + shadcn/ui + Tailwind

Server Components for data-heavy dashboard pages (reduce client bundle,
colocate data fetching), Client Components for interactive
forms/wallet-signing flows. shadcn/ui gives unstyled, composable
primitives that fit the "enterprise banking, not crypto-flashy" design
mandate (see [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)) better than a
pre-themed component library like Chakra or MUI, which would fight the
Stripe/Linear/Mercury aesthetic.

## 5. State management split

- **TanStack Query**: all server state (API responses) — caching,
  invalidation, optimistic updates for mutations like "execute payroll."
- **Zustand**: transient client-only UI state (active org selector, modal
  open/closed, wizard step) that doesn't belong in the URL or server.
- **React Hook Form + Zod**: all forms, with the same Zod schemas shared
  from `packages/shared` used for backend DTO validation, so validation
  logic is written once.

Full detail in [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md).

## 6. Blockchain SDK layer: packages/sdk

A dedicated TypeScript package wraps:
- Stellar RPC / Horizon client construction and network config
  (Testnet only for MVP).
- Contract client bindings generated from each Soroban contract's WASM/spec
  (via `soroban-client`/`@stellar/stellar-sdk` contract client codegen).
- Transaction-building helpers used by the backend (build unsigned XDR)
  and the frontend (submit signed XDR, poll for confirmation).

This isolates every place that talks to Stellar into one package so a
future RPC provider change or SDK major-version bump touches one package,
not the whole app. See [BLOCKCHAIN_ARCHITECTURE.md](./BLOCKCHAIN_ARCHITECTURE.md).

## 7. Authentication: Better Auth

Chosen over Auth.js for its more explicit plugin model for adding a custom
"wallet" credential provider (the Stellar challenge/response flow) without
fighting Auth.js's OAuth-shaped provider abstraction. Both are viable;
Better Auth's session/JWT primitives map more directly onto our
"one session shape regardless of login method" requirement. See
[AUTHENTICATION.md](./AUTHENTICATION.md).

## 8. Infra: Redis + BullMQ

Not required for MVP's synchronous flows, but the Event Indexer's polling
loop and any future retry-on-failure job (e.g., re-attempting a failed
`Transaction` status reconciliation) are modeled as BullMQ jobs from day
one so that "optional" doesn't become "bolted on later under pressure."
Redis runs in `docker-compose` for local dev; production can start without
it and add it when the indexer needs horizontal scaling.

Step 13 landed the indexer itself (`@nestjs/bullmq` + `bullmq`,
`IndexerModule` registering a 5-second repeatable job), so this is no
longer speculative — `REDIS_URL` defaults to `redis://localhost:6379`
rather than truly being optional now (see docs/EVENT_INDEXING.md).

## 9. Testing stack

Rust unit tests + `soroban-sdk` test utilities for contracts; Vitest for
backend and frontend unit/component tests; Playwright for e2e. Full matrix
in [TESTING_STRATEGY.md](./TESTING_STRATEGY.md).

## 10. Non-negotiables carried from the master spec

- Clean Architecture / SOLID / DDD-where-appropriate in the backend module
  structure (see [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md)).
- No upgradeable-proxy contracts — modular redeployment only (see
  [BLOCKCHAIN_ARCHITECTURE.md](./BLOCKCHAIN_ARCHITECTURE.md) §4).
- Strict separation of blockchain / backend / frontend / database /
  infrastructure — enforced by the monorepo package boundaries in
  [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md).
