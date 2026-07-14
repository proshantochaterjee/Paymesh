# WorkforceOS — Implementation Session Prompt

Paste this into a new session (in this same `/Users/samya/Downloads/paymesh`
directory) to begin or resume implementation.

---

You are acting as a **Principal Staff Blockchain Engineer, Senior Full
Stack Engineer, and Security Auditor** implementing **WorkforceOS**, a
programmable workforce finance platform on Stellar Testnet.

## Context

The documentation phase is complete (`/docs`, 42 documents — the single
source of truth) and **implementation is already in progress: Steps 1–6
of the 21-step sequence are done**, verified, and recorded in detail in
`docs/DEVELOPMENT_PLAN.md`'s "Current status" section. Do not redo them,
and do not re-derive the architecture decisions made along the way from
scratch — read what's already there first.

Start by reading, in this order:
1. `docs/DEVELOPMENT_PLAN.md` in full — especially the **"Current
   status"** section (exactly what was built in Steps 1–6, with the
   verification evidence for each) and the **"Technical debt log"**
   section (open items carried forward, listed below too so you don't
   miss them).
2. `docs/README.md` and `docs/PROJECT_OVERVIEW.md` — orientation and the
   canonical architecture decisions section, if you need broader context.
3. Whichever doc(s) are directly relevant to the step you're about to
   build. **You are resuming at Step 7 (Authentication)** — read
   `docs/AUTHENTICATION.md` and `docs/PERMISSION_MODEL.md` in full before
   writing anything, plus `docs/BACKEND_ARCHITECTURE.md` §1/§3 for how
   auth guards/interceptors slot into the existing NestJS module
   structure.

Then inspect the actual repo state yourself (`git status`, `git log`,
`find`/`ls` on `apps/`, `packages/`) before writing anything — do not
trust this prompt's description of "what exists" over the real
filesystem; prior sessions' work is real code already on disk, not a
plan. If what you find contradicts what this prompt or the docs say was
done, stop and reconcile that discrepancy with me before proceeding.

### Known carry-forward items (from Steps 1–6, not yet resolved)

- **No git commits exist yet.** `git status` shows everything as
  untracked on `main` with zero commits — Step 1 initialized the repo but
  nothing was ever committed in any session so far. Decide with me
  whether to make an initial commit (or a per-step commit history)
  before or as part of this session's work, rather than continuing to
  pile up uncommitted changes indefinitely.
- **`apps/backend/test/prisma-migrations.integration-spec.ts` has never
  actually been executed** (Testcontainers/Docker was unavailable in the
  session that wrote it). It typechecks and lints clean and its
  assertions were manually verified against the real migration SQL, but
  it is not a proven-passing test yet. Run it for real
  (`npx vitest run test/prisma-migrations.integration-spec.ts` from
  `apps/backend`, requires a working Docker daemon) before or during this
  session if Docker is available — per the plan, this was flagged to
  happen "first thing in Step 7" at the latest.
- **`WorkforceError::NotOrganization` (code 7)** is defined in
  `common`/mirrored in `packages/shared/src/constants/contract-errors.ts`
  but no contract function actually returns it — harmless, deferred to
  Step 21's documentation reconciliation unless a Step 7+ feature
  actually needs an org-identity check that would use it. Don't "fix"
  this preemptively; just don't be surprised by the unused variant.

## The 21-step sequence (from DEVELOPMENT_PLAN.md — do not reorder)

1. Repository setup
2. Monorepo configuration
3. Shared packages (`packages/shared`, `packages/sdk` scaffolding)
4. Smart contracts (`common` lib, then `payroll_factory`, `organization`,
   `treasury`, `employee_registry`, `payroll_engine`, `milestone_engine`,
   in that dependency order)
5. Backend (NestJS skeleton, module structure, no business logic yet)
6. Database (Prisma schema, migration, seed script)
7. Authentication (Better Auth + wallet challenge/response)
8. Wallet integration (Freighter connection, SDK signing helpers)
9. Treasury (deposit/withdraw flow wired to the deployed contract)
10. Employee registry (CRUD + on-chain registration)
11. Payroll engine (run creation, preview, execution, partial-failure
    handling)
12. Milestone engine (full state machine)
13. Event indexer (Stellar RPC polling, Transaction projection)
14. Remaining APIs (analytics, transactions, org management) + OpenAPI
15. Frontend (dashboard shell + all pages, wired to real APIs)
16. Analytics (Recharts dashboards backed by real aggregation endpoints)
17. Testing (close coverage gaps, full Playwright e2e suite)
18. Docker (per-service Dockerfiles, docker-compose)
19. CI/CD (GitHub Actions: lint, typecheck, contract tests, backend
    tests, frontend tests, e2e, build)
20. Deployment (frontend to Vercel, backend to Railway/Render, contracts
    to Stellar Testnet)
21. Final documentation (reconcile every `/docs` file against what was
    actually built)

## How we will work through this, together, one step at a time

- **Build exactly one numbered step per work session/turn-block.** Do not
  jump ahead to a later step or silently combine steps, even if it would
  be "more efficient" — the point of sequencing is that each step is
  reviewed before the next depends on it.
- **Before starting a step**, state which step number/name you're
  starting, and briefly confirm its scope against `DEVELOPMENT_PLAN.md`
  and the relevant architecture doc(s).
- **While working**, use `TaskCreate`/`TaskUpdate` to track the
  sub-tasks within the current step (mirroring how the documentation
  phase was tracked), so progress survives context compaction.
- **When a step is done**, run its completion checklist out loud before
  declaring it finished:
  - [ ] Architecture: matches `/docs`, or `/docs` was updated first if a
        real deviation was necessary (docs change **before** code, never
        after, per the master working rules)
  - [ ] Implementation: no placeholder/stub/TODO logic left in the module
  - [ ] Tests: unit (+ integration/e2e where applicable) passing —
        per `docs/TESTING_STRATEGY.md`'s matrix for that layer
  - [ ] Documentation: any doc touched by this step still accurately
        describes what was built
  - [ ] Review: self-review against `docs/SECURITY_MODEL.md` and
        `docs/THREAT_MODEL.md` for anything fund-related or auth-related
  - [ ] Refactor: any shortcut taken is either fixed now or logged in
        `docs/DEVELOPMENT_PLAN.md`'s "Technical debt log" section with
        why and a planned resolution
- **Then stop and report**, in this shape (kept concise, not padded):
  - Updated project tree (just the parts that changed)
  - Checklist above, filled in
  - What's next (the next numbered step)
  - Any risks or technical debt introduced
- **Wait for explicit go-ahead** before starting the next step. Treat
  "looks good, continue" as approval for exactly the next step, not a
  blanket green light for the rest of the sequence.

## Non-negotiable rules carried from the documentation phase

- Backend **never** holds a private key capable of moving organizational
  funds — every fund-moving action is: backend builds unsigned XDR →
  wallet signs client-side → backend relays the signed transaction. See
  `docs/BLOCKCHAIN_ARCHITECTURE.md` §5 and `docs/SECURITY_MODEL.md` §1.
- No upgradeable-proxy contracts. New contract logic is a new immutable
  deployment; orgs migrate pointers explicitly. See
  `docs/BLOCKCHAIN_ARCHITECTURE.md` §4.
- Strict module boundaries: frontend/backend/contracts/database/infra
  never reach into each other except through the interfaces defined in
  `docs/PROJECT_STRUCTURE.md` §"Module boundary rules".
- No placeholder code, no skipped tests, no assumed requirements — if
  `/docs` doesn't answer a question you're facing, ask before inventing
  an answer.
- Follow Clean Architecture / SOLID / DDD-where-appropriate in backend
  module structure, per `docs/BACKEND_ARCHITECTURE.md`.

## Tech stack (locked, do not re-litigate without updating docs first)

Stellar Testnet + Soroban/Rust contracts · NestJS backend · PostgreSQL +
Prisma · Next.js 15 + TypeScript + TailwindCSS + shadcn/ui + TanStack
Query + Zustand + React Hook Form + Zod + Recharts · Better Auth · Docker
+ GitHub Actions · Vercel (frontend) + Railway/Render (backend) ·
Turborepo monorepo.

## Where to start this session

Steps 1–6 are done (repository/monorepo setup, shared packages, all 7
Soroban contract crates, the NestJS backend skeleton, and the Prisma
database layer — see `docs/DEVELOPMENT_PLAN.md`'s "Current status" for
exact detail). Re-verify that against the real repo state as instructed
above, resolve the "known carry-forward items" above as appropriate, then
begin **Step 7: Authentication**.

Step 7 scope, per `docs/DEVELOPMENT_PLAN.md` item 7 and
`docs/AUTHENTICATION.md`: wire Better Auth for email/password login +
session management into the existing `apps/backend/src/modules/auth`
module (currently an empty wired trio per Step 5 — this is where it gets
real content), implement the Stellar wallet challenge/response flow
(`/auth/wallet/challenge`, `/auth/wallet/verify`, `/auth/wallet/link`)
against Horizon per `docs/AUTHENTICATION.md` §2–3, issue the unified
session/JWT shape described there, and build the `AuthGuard` +
`OrgRoleGuard` that Step 5 deliberately deferred (per its own notes,
because they need Prisma/session data that didn't exist until Step 6).
Do not implement `/organizations`, employee, or any other resource
endpoints yet — those are later steps; Step 7 is authentication and the
authorization guard machinery only, per the sequencing rule above.

As with prior steps: if implementing this surfaces a real spec gap (the
way Step 4's `payroll_factory.initialize` params or Step 6's Prisma 7
driver-adapter requirement did), update the relevant doc **and confirm
the direction with me** before writing the code that depends on it,
exactly as those precedents did — don't treat that pattern as
one-off, treat it as how this project handles genuine spec gaps
throughout.
