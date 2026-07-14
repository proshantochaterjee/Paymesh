# Development Plan

## Sequencing

Work proceeds in the order below. Each numbered step is a milestone: it is
not considered done until architecture is documented, code is implemented,
tests pass, docs are updated to match reality, and a review/refactor pass
has happened. Do not start step N+1 until step N's checklist is complete.

1. **Repository setup** — root config, license, editorconfig, base
   `package.json` workspaces, `Cargo.toml` workspace for contracts.
2. **Monorepo configuration** — Turborepo or Nx (decision recorded in
   [TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md)), shared
   `configs/` for eslint/tsconfig/tailwind.
3. **Shared packages** — `packages/shared` (types, Zod schemas, constants)
   and `packages/sdk` scaffolding (no implementation yet, just build
   pipeline).
4. **Smart contracts** — `common` lib crate, then `payroll_factory`,
   `organization`, `treasury`, `employee_registry`, `payroll_engine`,
   `milestone_engine` in that dependency order, each with unit tests before
   moving to the next.
5. **Backend** — NestJS app skeleton, module structure per
   [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md), no business logic
   yet.
6. **Database** — Prisma schema per
   [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md), initial migration, seed
   script.
7. **Authentication** — Better Auth email/password + session; JWT issuance;
   the Stellar wallet challenge/response *login* flow
   (`/auth/wallet/challenge`/`verify`/`link`) — moved up from its original
   placement under Step 8 below since it's authentication, not treasury
   integration; confirmed in the Step 7 session. `AuthGuard`/`OrgRoleGuard`
   land here too (deferred from Step 5).
8. **Wallet integration** — Freighter connection flow on frontend, SDK
   signing helpers for building/submitting transactions (not wallet
   *login*, which is Step 7 — see above).
9. **Treasury** — deposit flow, balance reads, deposit/withdrawal history,
   wired to the deployed `treasury` contract on Testnet.
10. **Employee registry** — CRUD API + UI, on-chain registration calls to
    `employee_registry`.
11. **Payroll engine** — payroll run creation, preview, execution against
    `payroll_engine`, partial-failure handling.
12. **Milestone engine** — full milestone state machine against
    `milestone_engine`.
13. **Event indexer** — Stellar RPC event polling service, `Transaction`
    projection, `IndexerCursor` checkpointing.
14. **APIs** — remaining REST endpoints (analytics, transactions, org
    management) and OpenAPI generation.
15. **Frontend** — dashboard shell, all pages per
    [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md), wired to real
    APIs (no mock data left in place).
16. **Analytics** — Recharts-based dashboards backed by real aggregation
    endpoints.
17. **Testing** — close any coverage gaps left by per-module tests;
    end-to-end Playwright suite covering the full demo script.
18. **Docker** — per-service Dockerfiles, docker-compose for local dev
    (Postgres, backend, frontend, optional Redis).
19. **CI/CD** — GitHub Actions: lint, typecheck, contract tests, backend
    tests, frontend tests, e2e, build.
20. **Deployment** — frontend to Vercel, backend to Railway/Render,
    contracts deployed to Stellar Testnet with recorded contract IDs.
21. **Final documentation** — reconcile every doc in `/docs` against the
    shipped system; write [SCF_DEMO.md](./SCF_DEMO.md) walkthrough.

## Per-milestone checklist template

```
- [ ] Architecture: doc(s) updated/created and internally consistent
- [ ] Implementation: no placeholder/stub logic left in the module
- [ ] Tests: unit + integration (and e2e where applicable) passing
- [ ] Documentation: doc(s) reflect what was actually built
- [ ] Review: self-review against SECURITY_MODEL.md and this module's doc
- [ ] Refactor: any debt introduced is either resolved or logged below
```

## Technical debt log

- [x] `packages/contracts` had no `package.json`/turbo task shim — introduced
      in Step 2 (see prior note), **resolved in Step 4**: added
      `packages/contracts/package.json` (build/lint/typecheck/test scripts
      shelling out to `cargo`) now that real member crates exist; verified
      `turbo run build lint typecheck test` from the repo root runs all 7
      Rust crates' 52 tests alongside the TS packages in one command.
- [x] `packages/shared/src/constants/contract-errors.ts` didn't exist —
      introduced in Step 3, **resolved in Step 4**: added, mirroring
      `common::error::WorkforceError`'s 16 numeric codes byte-for-byte now
      that they're fixed in Rust.
- [ ] `WorkforceError::NotOrganization` (code 7) is defined in the shared
      Rust error registry and mirrored in `contract-errors.ts`, but no
      implemented contract function actually returns it — introduced in
      Step 4 while implementing `treasury`; reason: the original spec listed
      it under treasury's errors ("caller isn't the linked organization
      contract, for admin-gated calls") but no documented treasury function
      matches that description once `withdraw`/`transfer_out` were
      implemented via role-based checks instead; not blocking (an unused
      enum variant is harmless), planned resolution: revisit when/if a
      future admin-gated treasury function needs an org-identity check, or
      remove it from the spec/registry in Step 21's final documentation pass
      if nothing ever needs it.
- [x] `apps/backend/test/prisma-migrations.integration-spec.ts` (Testcontainers,
      per `TESTING_STRATEGY.md`) was written in Step 6 but never actually
      executed (Docker's daemon was unresponsive that session).
      **Resolved in Step 7**, but not by fixing Docker: decided with you not
      to depend on Docker/Testcontainers for this project going forward
      (Docker was unavailable again this session — daemon installed but not
      running). Rewrote the test to create/drop a throwaway database on the
      locally-configured Postgres server instead of an ephemeral
      Testcontainers instance; `TESTING_STRATEGY.md` §1-2 updated first to
      describe the new approach. Actually executed for real this time: all
      5 assertions pass (table list now includes Step 7's `accounts`/
      `verifications`/`jwks`, plus a new Better Auth cascade-delete check),
      confirmed via `turbo run test` from the repo root, not just in
      isolation. `@testcontainers/postgresql` removed from
      `apps/backend/package.json` as now-unused.
- [ ] The Step 7 decision to drop Docker/Testcontainers was scoped to
      backend integration tests only, not decided project-wide — Steps 18
      (per-service Dockerfiles, docker-compose for local dev), 19 (CI/CD,
      whose backend-tests job already provisions Postgres as a plain
      GitHub Actions service container, not Testcontainers-in-Docker, so
      likely unaffected), and 20 (deployment) still assume Docker as
      documented in `DOCKER_SETUP.md`/`DEPLOYMENT_GUIDE.md`; not blocking
      now, planned resolution: revisit explicitly when starting Step 18,
      not by default carrying this session's decision forward.
- [x] `apps/backend/src/modules/auth/lib/stellar-signature.ts` imports
      `@stellar/stellar-sdk` directly to verify wallet-login signatures
      against Horizon — introduced in Step 7; a deliberate, contained
      exception to `BACKEND_ARCHITECTURE.md` §4's rule that only
      `infra/*-chain.adapter.ts` files import `packages/sdk`. **Resolved in
      Step 9** as planned: moved to `packages/sdk/src/stellar/wallet-signature.ts`
      once Step 8 gave the SDK real Horizon/RPC client construction;
      `apps/backend` no longer imports `@stellar/stellar-sdk` directly at
      all, only via `@workforceos/sdk`, restoring the documented boundary.
- [ ] `PATCH /employees/:employeeId` salary/frequency edits made while the
      employee's *initial* registration is still pending (no
      `onChainEmployeeId` yet) are Postgres-only — the already-built
      register-intent's XDR was assembled with whatever values were in
      Postgres at `POST /employees` time, and isn't retroactively updated
      by a later edit. Introduced in Step 10 (`EMPLOYEE_MODEL.md` §4); not
      blocking (the HR user can still complete registration then issue a
      follow-up `PATCH`, which now has a confirmed `onChainEmployeeId` and
      builds a real update-intent), but a real edge case a careless HR user
      could hit without an explicit warning today. Planned resolution:
      either block editing salary/frequency while a register-intent is
      outstanding-but-unsubmitted (frontend or backend-enforced), or once
      Step 13's Event Indexer exists, re-derive the register XDR from
      current Postgres state at submit time instead of build time —
      revisit when Step 15's employee UI needs a concrete answer.
- [ ] Changing an employee's wallet address has no implementation —
      `employee_registry.update_employee` has no wallet parameter at all
      (verified against the real contract source in Step 10), so there's
      no direct on-chain path; the real mechanism would be deactivate-old +
      register-new (a new `employee_id`). Not blocking for Step 10's scope
      (no endpoint currently claims to support it — `EMPLOYEE_MODEL.md` §5,
      `API_SPECIFICATION.md`'s Employees section both say so explicitly).
      Planned resolution: design and build when a real user flow first
      needs it (likely alongside Step 15's employee detail UI).

Documentation phase complete. Implementation in progress.

- [x] Step 1: Repository setup — git repo initialized (`main` branch), MIT
      `LICENSE`, root `.gitignore`/`.editorconfig`/`.nvmrc` (Node 20), base
      root `package.json` (npm workspaces: `apps/*`, `packages/*`), empty
      `packages/contracts/Cargo.toml` workspace (members added in Step 4).
- [x] Step 2: Monorepo configuration — `turbo.json` (build/lint/typecheck/
      test/dev tasks per `CI_CD.md` and `DOCKER_SETUP.md`), root
      `packageManager`/devDependencies (turbo, typescript, eslint,
      typescript-eslint), `configs/typescript/base.json`,
      `configs/eslint/base.mjs`, `configs/tailwind/theme.css` (implements
      the `DESIGN_SYSTEM.md` §1 token contract for Tailwind v4's CSS-first
      config). Verified: `tsc` catches a real type error against the base
      config, `eslint` flags a real unused-var against the base config,
      `turbo run {build,lint,typecheck,test}` all resolve cleanly (0
      packages exist yet — expected, none are created until Steps 3/5/15).
- [x] Step 3: Shared packages — `packages/shared` (real content, per this
      step's scope): `constants/` (roles + `hasAtLeastRole` mirroring the
      `organization` contract's Owner>Admin>{Finance,Hr}>Viewer ordering
      incl. Finance/Hr incomparability, Prisma-mirrored enums, API error
      code→status map, pagination/CSV-import/intent constants),
      `schemas/` (Zod schemas for auth, organization, member, employee incl.
      the CSV-import-shared core fields, contractor, payroll, milestone,
      transaction, plus primitives for Stellar account/contract addresses
      and decimal amounts), `types/` (API error/paginated/intent response
      shapes), full barrel export. `packages/sdk` (scaffolding only, per
      this step's scope): package/tsconfig/eslint wiring, `src/index.ts`
      re-exports `@workforceos/shared` (no Stellar/contract/API client
      logic yet — that lands in Steps 8, 9, 13, 14). Verified: 15 Vitest
      unit tests pass in `shared`, `tsc`/`eslint` clean in both packages,
      the compiled `sdk` output resolves and re-exports `shared` at
      runtime, and `turbo run build lint typecheck test` succeeds
      end-to-end across both packages from the repo root.
- [x] Step 4: Smart contracts — all 7 crates (`common`, then `payroll_factory`,
      `organization`, `treasury`, `employee_registry`, `payroll_engine`,
      `milestone_engine` in that dependency order), targeting `wasm32v1-none`
      (not `wasm32-unknown-unknown` — see below). `common` provides the
      shared `WorkforceError` registry (16 codes), `Role` enum with
      `has_at_least`/`can_move_funds`, `DataKey` storage-key builders,
      typed `#[contractevent]` structs for all 21 documented events, shared
      cross-contract-call clients (`common::clients`, a
      `#[contractclient]`-based pattern — see below), and shared types
      (`OrgRecord`, `EmployeeRecord`/`PayFrequency`) usable by those clients.
      Each contract implements its full documented public interface with no
      placeholder logic. Verified: 52 unit/integration tests pass across the
      workspace (including a real end-to-end `create_organization` deploying
      actual compiled `organization`/`treasury` WASM via `deploy_v2`, and a
      full milestone Draft→Funded→Approved→Released walk moving real SAC
      token balances), `cargo clippy --all-targets -- -D warnings` and
      `cargo fmt --check` clean on every crate, `cargo build --target
      wasm32v1-none --release` succeeds for the whole workspace, and each
      contract's compiled WASM exports *only* its own documented functions
      (verified with a WASM export-section inspection) — no cross-contract
      symbol leakage.

  **Toolchain finding**: `soroban-sdk` 26.x's build script rejects
  `wasm32-unknown-unknown` on Rust 1.82+; the correct target is
  `wasm32v1-none`. Fixed in `DEPLOYMENT_GUIDE.md` and `CI_CD.md` (which also
  now builds before testing, since `payroll_factory`'s test needs
  `organization`/`treasury`'s compiled WASM to already exist).

  **Real Soroban pattern learned and applied**: depending on another
  contract's actual `#[contract]` crate as a regular dependency links its
  exported functions into the *depending* crate's own WASM too (Rust's
  `#[no_mangle]`-based export mechanism isn't scoped per final artifact) —
  caught via WASM export inspection when `treasury` first depended on
  `organization` directly. Fixed by moving to lightweight
  `#[contractclient]`-generated clients in `common::clients`
  (organization/treasury/payroll_factory/employee_registry), with the real
  contract crates only ever used as dev-dependencies (test-only, safe).
  Separately, `milestone_engine`'s original refund-via-`treasury.deposit`
  design was found to violate Soroban's implicit contract-auth (which only
  recognizes the *immediate* caller, not a two-hop-back one) via a failing
  test, not a design review — fixed by having `milestone_engine` refund via
  a direct token transfer, the same pattern `release_milestone` already used.

  **Spec completions** (docs updated before code, each covering a
  storage/initialize gap the original spec described only in prose or not
  at all — see `SMART_CONTRACT_SPECIFICATION.md` for the concrete field-level
  diffs): `payroll_factory.initialize` gained
  `employee_registry`/`payroll_engine`/`milestone_engine` params (nothing
  otherwise supplied them to new orgs); `organization` gained an
  `OwnerCount` counter (no other way to detect "last owner");
  `employee_registry`/`payroll_engine`/`milestone_engine` each gained an
  `initialize(factory: Address, ...)` entry point plus a `PayrollFactory`/
  `OrgRecordCache` (or `OrgAddress`) cache, since none of them had any
  documented way to resolve an `org_id` to its `organization`/`treasury`
  addresses; `milestone_engine` additionally gained a `TokenAddress` field
  for `release_milestone`'s direct transfer. All confirmed with you before
  implementing (factory case) or as direct continuations of that same
  approved pattern (the rest — each is a single-obvious-answer storage
  completion, not a product-direction fork).

- [x] Step 5: Backend — NestJS app skeleton at `apps/backend` (Vitest, not
      Jest, per `TESTING_STRATEGY.md`; `@swc/core`/`unplugin-swc` stand in
      for esbuild/oxc since NestJS's DI needs `emitDecoratorMetadata`).
      Module structure per `BACKEND_ARCHITECTURE.md` §2: all 10 domain
      modules (`auth`, `organizations`, `treasury`, `employees`,
      `contractors`, `payroll`, `milestones`, `transactions`, `analytics`,
      `indexer`) exist as real, wired `*.module.ts`/`*.controller.ts`
      (route-prefixed per `API_SPECIFICATION.md`, no handlers yet)/
      `*.service.ts` (empty) trios — `indexer` has no controller, per spec.
      No business logic, per this step's explicit scope; each file notes
      which later step adds real content. Cross-cutting infra that doesn't
      forward-depend on Prisma/auth (both Step 6/7) was built for real,
      not stubbed: `AppConfigModule` (fail-fast Zod env validation per §7),
      `AppLoggingModule` (`nestjs-pino` structured JSON logs with
      correlationId/redaction per `LOGGING.md`), `AllExceptionsFilter` +
      `DomainException` (maps to the exact `ERROR_HANDLING.md` §1 shape),
      `ZodValidationPipe`, and a liveness-only `/health` endpoint
      (`DEVOPS.md` §4 — DB/RPC checks land in Steps 6/9). `AuthGuard`/
      `OrgRoleGuard`/`AuditLogInterceptor` are deliberately deferred to
      Steps 6/7 since they need Prisma/session data that doesn't exist yet.
      Verified: 15 Vitest tests pass (including a full app-boot e2e test
      proving all 10 modules wire together via real Nest DI with zero
      errors, plus `/health` vs. `/api/v1/health` prefix-exclusion
      behavior), `eslint`/`tsc --noEmit` clean, `nest build` produces a
      real `dist/`, and the **compiled** app was booted standalone and
      hit with `curl` — `/health` returned `200 {"status":"ok"}` with a
      correctly-shaped structured log line, `/api/v1/health` correctly
      404s. Also fixed in passing: a transitive `multer` DoS advisory
      pulled in by `@nestjs/platform-express`, resolved via a root
      `package.json` `overrides` pin rather than downgrading NestJS.

- [x] Step 6: Database — Prisma schema at `apps/backend/prisma/schema.prisma`
      (all 14 models + 9 enums from `DATABASE_SCHEMA.md`, byte-for-byte),
      one initial migration (`20260707095505_init`) applied and committed,
      `PrismaService`/`PrismaModule` (global, injectable) wired into
      `AppModule`, `/health` now genuinely checks DB connectivity
      (`SELECT 1`) rather than liveness-only, and `scripts/seed-db.ts` (a
      demo org, 3 users across OWNER/FINANCE/HR, 2 departments, 3 employees
      incl. one soft-deleted, 2 contractors, a completed + a draft payroll
      run, 2 milestones in different states, and their corresponding
      `Transaction` rows) with the `--allow-non-local` safety guard from
      `DEVOPS.md` §3 (verified it actually refuses a non-local
      `DATABASE_URL` and exits non-zero). Verified: 18 Vitest tests pass
      (config schema, `PrismaService` DI construction, `/health`'s real DB
      round-trip via the full app-boot e2e test), `eslint`/`tsc --noEmit`
      clean, `nest build` regenerates the Prisma client and compiles
      cleanly, the seed script runs twice with no duplicate rows (upsert
      idempotency) and correctly refuses a non-local `DATABASE_URL`, and
      the real migration was applied against a live local Postgres and
      independently inspected via `psql` (all 15 tables incl.
      `_prisma_migrations`, correct FK cascade/restrict behavior in the
      generated SQL).

  **Toolchain finding**: Prisma 7 (latest stable) removed
  `datasource.url` from schema files entirely — `PrismaClient` now
  requires a driver adapter (`@prisma/adapter-pg`) or an Accelerate URL,
  and the CLI reads the connection string from a new root-level
  `prisma.config.ts` instead. Confirmed with you before adopting this
  (vs. pinning Prisma 6.x) since it's a real architectural fork, not a
  single-obvious-answer fix. `DATABASE_SCHEMA.md`'s schema comment and
  `PROJECT_STRUCTURE.md`'s tree (which had `prisma/` nested under `src/`,
  contradicting `DATABASE_SCHEMA.md`'s own explicit `apps/backend/prisma/`
  path comments) were both updated — confirmed the correct path with you
  before creating any files.

  **Known verification gap**: `test/prisma-migrations.integration-spec.ts`
  (Testcontainers-based, per `TESTING_STRATEGY.md`'s specified approach —
  spins up its own ephemeral Postgres, applies migrations, verifies all
  15 tables exist, a unique-constraint violation, and cascade-delete
  behavior) could not be executed in this session: Docker's daemon became
  unresponsive after an unrelated disk-space exhaustion incident in the
  sandbox and would not recover. The code was typechecked and lint-clean,
  and every constraint it asserts (the `employees_organizationId_onChainEmployeeId_key`
  unique index, the `ON DELETE CASCADE` on `employees_organizationId_fkey`)
  was independently confirmed present in the real generated migration SQL
  by direct inspection — but the test itself has not actually been run
  end-to-end. Planned resolution: run it (`npx vitest run
  test/prisma-migrations.integration-spec.ts` from `apps/backend`) the
  next time Docker is available, before relying on it as a passing gate.

- [x] Step 7: Authentication — Better Auth wired for real against the
      existing Prisma schema (additive migration
      `20260707122822_add_better_auth_tables`: `Account`, `Verification`,
      `Jwks` models; `User` gains `name`/`emailVerified`/`image`,
      `passwordHash` removed — password hashes now live on `Account`, per
      Better Auth's credential-provider convention). `AuthController`
      (`/auth/register`, `/login`, `/logout`, `/refresh`,
      `/wallet/challenge`, `/wallet/verify`, `/wallet/link`) calls
      `auth.api.*` programmatically rather than mounting Better Auth's own
      router, so route paths/response shapes stay exactly what
      `API_SPECIFICATION.md` documents. Wallet challenge/response
      (`apps/backend/src/modules/auth/lib/wallet-plugin.ts`) is a real
      custom Better Auth plugin — the reason `TECHNICAL_ARCHITECTURE.md`
      §7 chose Better Auth over Auth.js — reusing Better Auth's own
      `Verification` store (atomic single-use consume) for the nonce
      instead of a bespoke table. Signature verification
      (`lib/stellar-signature.ts`) checks real signer weight against the
      account's medium threshold via Horizon, per `SECURITY_MODEL.md` §7.
      Password hashing overridden to real argon2id (`lib/password-hasher.ts`,
      the `argon2` package) since Better Auth's own default is scrypt;
      registration additionally enforced with `zxcvbn` (score ≥ 3) per
      `AUTHENTICATION.md` §5. `AuthGuard`/`OrgRoleGuard`/`@MinRole`
      (deferred from Step 5) now have real content: `AuthGuard` accepts
      either the httpOnly session cookie or an `Authorization: Bearer
      <jwt>` access token (Better Auth's `jwt` plugin, 15 min expiry);
      `OrgRoleGuard` reads `@MinRole(Role.X)` and checks the caller's
      `OrganizationMember.role` for the org in the URL (`:orgId` for
      nested resource controllers, `:id` for the organization resource's
      own routes — both already established by Step 5's controller
      skeletons). `@nestjs/throttler` wired globally (100 req/min default)
      with a 10 req/min override on `/auth/*`'s unauthenticated routes,
      per `SECURITY_MODEL.md` §6. Verified: 53 Vitest tests pass (20 unit
      — including a mocked-Horizon regression test for the signature
      threshold bug below — plus a rewritten, now-actually-executed
      `prisma-migrations.integration-spec.ts` and 10 new
      `auth.e2e-spec.ts` integration tests hitting the real compiled app
      against a real Postgres and, for the wallet flow, real Stellar
      Testnet Horizon/Friendbot), `eslint`/`tsc --noEmit` clean,
      `turbo run build lint typecheck test` succeeds end-to-end from the
      repo root (Rust contract tests included, unaffected). The full
      register → login → refresh → logout flow and the wallet
      challenge → verify → link flow were also manually driven end-to-end
      against the compiled app with `curl`/real Stellar Testnet keypairs
      before being encoded as permanent tests.

  **Toolchain finding**: Better Auth's actual default password hasher is
  scrypt, not argon2id as `AUTHENTICATION.md` §5 stated — overridden via
  `emailAndPassword.password.{hash,verify}` to real argon2id so the
  documented behavior is what actually ships, rather than quietly
  weakening the doc to match the library default.

  **Toolchain finding (real bug caught by manual + automated testing,
  not just typecheck/lint)**: two issues only surfaced by actually
  exercising the running app, both now fixed and covered by regression
  tests: (1) a garbage wallet signature was silently **accepted** because
  a fresh/default Stellar account has all thresholds at 0 — "0 verified
  signer weight" trivially satisfied "≥ 0 threshold." Fixed by requiring
  nonzero verified weight before the threshold comparison at all
  (`stellar-signature.ts`). (2) Bearer-mode JWTs were minted with an
  empty-string `aud`/`iss` claim (this app never configures a `baseURL`,
  which the `jwt` plugin defaults to), and Better Auth's own `verifyJWT`
  unconditionally rejects a falsy `aud` — silently breaking every
  bearer-mode request. Fixed by setting an explicit
  `jwt: { issuer: "workforceos", audience: "workforceos" }` rather than
  relying on the `baseURL` default.

  **Spec completions** (docs updated before/alongside code, each a
  single-obvious-answer gap, not a product-direction fork — same pattern
  as Step 4/6's storage completions): `User.name` is required by Better
  Auth's core schema but never mentioned in `AUTHENTICATION.md`'s
  register flow — derived server-side from the email's local-part rather
  than expanding the public `/auth/register` contract.
  `/auth/wallet/link` was documented in `AUTHENTICATION.md` §3 but
  missing from `API_SPECIFICATION.md`'s Auth table — added. Two new
  `ApiErrorCode`s added to `packages/shared` + `ERROR_HANDLING.md`
  (`WALLET_ALREADY_LINKED` 409, `EMAIL_ALREADY_REGISTERED` 409) for
  conflict cases the original error table didn't enumerate.
  `BACKEND_ARCHITECTURE.md` §3 and `PERMISSION_MODEL.md` §2 both said
  `OrgRoleGuard` reads "the `:id` org in the URL" — the real, already-
  committed Step 5 controllers use `:orgId` for every nested resource
  (`organizations/:orgId/treasury`, etc.) and only the organization
  resource's own routes use `:id`; both docs corrected to describe both
  param names.

- [x] Step 8: Wallet integration — scoped down to `packages/sdk` only
      (confirmed with you): `apps/frontend` doesn't exist until Step 15,
      so there's no "frontend" yet for a Freighter connection flow to live
      in. `packages/sdk/src/stellar/` gained real content: `network.ts`
      (Testnet-only config, `Networks.TESTNET` passphrase — no mainnet
      code path, per `BLOCKCHAIN_ARCHITECTURE.md` §1), `rpc-client.ts`
      (Soroban RPC + Horizon client construction, one place to change if
      the RPC provider ever changes), `freighter.ts` (a thin wrapper over
      `@stellar/freighter-api`: connect, sign message, sign transaction —
      normalizes its `{ error }`-return-value convention to thrown errors,
      and normalizes `signMessage`'s `Buffer | string` inconsistency
      across extension versions to always a base64 string, matching what
      `/auth/wallet/verify` expects). Deliberately did **not** build the
      transaction-simulation/build-unsigned-XDR helper described in
      `BLOCKCHAIN_ARCHITECTURE.md` §5's "Build" row — that has no real
      consumer until Step 9 (treasury deposit is the first feature that
      actually builds a transaction), so building it now would be
      speculative. Verified: 14 Vitest tests pass (network config
      defaults/overrides, RPC/Horizon client construction, and the full
      Freighter wrapper incl. both `signMessage` response shapes and every
      error path, via a mocked `@stellar/freighter-api`), `eslint`/
      `tsc --noEmit` clean, `turbo run build lint typecheck test` succeeds
      end-to-end from the repo root (16 tasks, backend's 54 tests
      unaffected).

- [x] Step 9: Treasury — two parts, confirmed with you before starting:
      real Testnet contract deployment (Step 9's own wording, "wired to the
      deployed treasury contract on Testnet," was previously undeliverable
      — `.env` had placeholder `CAAA...A` addresses), then the backend
      module.

  **Contract deployment** (`scripts/deploy-contracts.sh`,
  `deployed-addresses.testnet.json`, both new): deployed under a
  project-scoped `workforceos-deployer` Stellar CLI identity (the dev
  machine already had many unrelated pre-existing identities from other
  projects — confirmed this before reusing/generating anything). USDC SAC
  decision finalized (`BLOCKCHAIN_ARCHITECTURE.md` §1 had left this open):
  self-issued `TUSDC`, the deployer is its own issuer. Uploaded all 6
  contracts' WASM; deployed+initialized `payroll_factory`,
  `employee_registry`, `payroll_engine`, `milestone_engine` (dependency
  order: deploy all 4 first since Soroban addresses are known before
  `initialize` is ever called, resolving the circular factory↔singletons
  reference); `organization`/`treasury` are never deployed standalone —
  only their WASM hashes are uploaded, since `payroll_factory` deploys a
  fresh instance of each dynamically per organization. Verified with a
  real `create_organization` call (org #1) before building anything on
  top of it.

  **Backend module** (was an empty trio): `TreasuryController`/`Service`
  follow `BACKEND_ARCHITECTURE.md` §1's layering for real for the first
  time — `infra/treasury.repository.ts` (Prisma) and
  `infra/treasury-chain.adapter.ts` (the only file in the module that
  imports `packages/sdk`, per §4's boundary). Implements
  `BACKEND_ARCHITECTURE.md` §5's build/submit intent pattern for real for
  the first time: new `Intent` Prisma model + migration (not in
  `DATABASE_SCHEMA.md`'s core entity list, ephemeral by design). Routes
  match `API_SPECIFICATION.md`'s Treasury table exactly (`201` build,
  `202` submit — `:orgId` not `:id`, `API_SPECIFICATION.md`/
  `TREASURY_ARCHITECTURE.md` corrected to match, same fix as Step 7's
  `OrgRoleGuard` finding). `packages/sdk/src/stellar/treasury-client.ts`
  builds unsigned deposit/withdraw XDR via a dynamically-fetched
  `contract.Client` (treasury has no fixed address to codegen against —
  it's per-org) and submits signed XDR via a raw `rpc.Server`; `amount.ts`
  converts between decimal strings and raw i128 stroops.

  Also resolved the Step 7 technical debt item on schedule: now that Step
  8 gave `packages/sdk` real Horizon/RPC client construction,
  `wallet-signature.ts` (verifyStellarSignature) moved from
  `apps/backend/src/modules/auth/lib/` into `packages/sdk/src/stellar/`,
  restoring `BACKEND_ARCHITECTURE.md` §4's boundary — `apps/backend` no
  longer depends on `@stellar/stellar-sdk` directly at all, only via
  `@workforceos/sdk`.

  Verified: real end-to-end runs against the actual deployed contracts on
  Testnet, not mocks — a live `curl`/script-driven deposit and withdrawal
  (balance genuinely moved on-chain) before writing any permanent test.
  31 `packages/sdk` tests (unit, incl. a mocked-RPC regression test for
  the simulation-failure bug below) and 69 backend tests (12 files,
  incl. `treasury.service.spec.ts` unit tests and a `treasury.e2e-spec.ts`
  that creates a brand-new real organization on the live `payroll_factory`
  — no dependency on any pre-existing org — then drives real deposit,
  withdrawal, replay-rejection, role-rejection, and simulation-failure
  flows against real Testnet). `turbo run build lint typecheck test`
  green across all 16 tasks from the repo root.

  **Toolchain findings** (each caught by actually running real code
  against the real network, not by typecheck/lint/mocks alone):
  1. `@stellar/freighter-api`'s CJS bundle doesn't expose named exports
     under Node's strict ESM/CJS interop — `import { isConnected } from
     "@stellar/freighter-api"` typechecked fine and passed under Vitest
     (Vite's more lenient transform) but crashed `node dist/...` at boot.
     Fixed by importing the default export only and reading named
     functions off it at runtime (`freighter.ts`).
  2. Soroban's `AssembledTransaction.build()` still returns *something*
     from `.toXDR()` when its own simulation fails (e.g. a missing
     trustline) — submitting that XDR is guaranteed to fail as
     `txMalformed`, but nothing surfaces this at build time by default.
     Discovered when a real signed withdrawal to an account with no TUSDC
     trustline failed with a generic network-level error instead of a
     clear one. Fixed with an explicit `rpc.Api.isSimulationError` check
     right after building (`treasury-client.ts`), mapped to
     `502 SIMULATION_FAILED` — the caller never signs a doomed
     transaction. Now covered by both a real e2e test and a mocked unit
     test so the regression can't come back silently.
  3. `payroll_factory.get_organization` returns `Result<OrgRecord,
     WorkforceError>` on the Rust side, which the JS SDK decodes to
     `{ value: OrgRecord }`, not a flat `OrgRecord` — discovered building
     the e2e test's self-contained org-creation fixture
     (`test/helpers/testnet-fixtures.ts`) by logging the real decoded
     result rather than assuming the shape.

  **Known test-environment dependency** (not blocking, logged so it's
  not a surprise later): `treasury.e2e-spec.ts` needs the local
  `workforceos-deployer` Stellar CLI identity (it's the TUSDC issuer, the
  only account that can fund test accounts with TUSDC) — same category of
  local dependency as the Postgres integration test needing a local
  Postgres server. Fails fast with a clear error if that identity isn't
  present rather than silently skipping. Revisit when Step 19 sets up CI:
  either provision this identity as a CI secret, or reconsider the test's
  design at that point.

- [x] Step 10: Employee registry — CRUD API (no UI yet, same reasoning as
      Step 8: `apps/frontend` doesn't exist until Step 15), on-chain
      registration calls to `employee_registry`, plus CSV import.

  Two real spec gaps confirmed with you before writing code, since both
  changed the module's whole shape:
  1. `EMPLOYEE_MODEL.md` §3 described two-phase creation but
     `API_SPECIFICATION.md` never actually showed a build/submit intent
     pair for it (unlike Treasury). Confirmed: `POST /employees` writes
     the Postgres row **and** builds the register-intent in one response
     (registering isn't an optional follow-up the way a treasury deposit
     is), with a new `register-intent/:intentId/submit` endpoint; the same
     shape extended to `PATCH` (`update-intent`, only when salary/frequency
     change on an already-registered employee) and `deactivate`
     (`deactivate-intent`, only when registered).
  2. `CSV_IMPORT.md` §4 described batching multiple `register_employee`
     calls into one transaction for one signature per chunk — confirmed
     against the real network to be **impossible**: Soroban RPC hard-
     rejects any transaction with more than one `InvokeHostFunction`
     operation. Confirmed with you: import commits one register-intent per
     employee (reusing the single-employee submit endpoint), corrected in
     `CSV_IMPORT.md` with the real constraint explained (this doesn't
     affect `PAYROLL_ENGINE.md` §2's chunking, which is a single call with
     a `Vec` argument — contract-side batching, not transaction-side).

  **Backend module**: `EmployeesController`/`Service`/`Repository`/
  `ChainAdapter` follow the same layering Treasury established in Step 9.
  `packages/sdk/src/stellar/employee-registry-client.ts` builds
  register/update/deactivate XDR against the real deployed
  `employee_registry` singleton (network-wide, fixed address from config
  — unlike treasury's per-org address from the DB, a new
  `STELLAR_EMPLOYEE_REGISTRY_CONTRACT_ADDRESS` env var).
  `common/intent/intent.service.ts` + `intent.repository.ts` factored out
  of `treasury/` (Treasury refactored to use it too, all its tests still
  pass) once Employees needed the identical create/validate/submit/
  consume logic — a real second consumer, not speculative reuse.
  CSV import (`csv-import.util.ts`, `csv-parse` added as a dependency):
  dry-run validation matches `CSV_IMPORT.md` §2's failure-reason table
  exactly (presence checked before format, so a missing field is never
  also reported as an invalid one); a real commit creates only rows that
  pass, one register-intent per created row.

  **Real bugs found by end-to-end verification against the actual
  deployed contract** (not just typecheck/lint/mocks — each is now
  covered by a regression test):
  1. `wallet-plugin.ts`'s `/wallet/link` (Step 7) created a `Wallet` row
     but never set `User.primaryWallet` — an email/password user linking
     a wallet had `primaryWallet: null` forever, silently breaking
     anything that infers "act as the caller's own wallet" from the
     session (Employees' create/update/deactivate all do, since the
     on-chain `caller` must match whoever signs). Confirmed the fix with
     you: first wallet linked becomes primary automatically if unset.
     `AUTHENTICATION.md` §3 updated to document the actual behavior.
  2. Native `JSON.stringify` cannot serialize `BigInt` at all — never
     surfaced before because no endpoint had ever returned a *populated*
     `BigInt` Prisma column in a live response until
     `Employee.onChainEmployeeId` actually got backfilled. Fixed with a
     global `BigInt.prototype.toJSON` polyfill
     (`common/bigint-json.polyfill.ts`, imported for its side effect at
     the top of `app.module.ts` so it applies under every entry point,
     prod boot and tests alike) rather than converting by hand at each of
     the several other `BigInt` columns that will hit this same wall in
     later steps (`onChainMilestoneId`, `ledgerSequence`, ...) —
     documented in `DATABASE_SCHEMA.md`.
  3. Running two real-Testnet e2e-spec files together (`treasury` +
     `employees`, Vitest's default parallel file execution) intermittently
     crashed on a malformed RPC simulation response — both hitting the
     same real `payroll_factory.create_organization` around the same
     time. Confirmed as a concurrency artifact (each file alone is
     reliable); fixed by disabling `fileParallelism` in
     `vitest.config.ts`, documented in `TESTING_STRATEGY.md` §2.

  Verified: real end-to-end runs against the actual deployed contract —
  register/update/deactivate calls, each confirmed on Testnet before
  writing the permanent test (mirroring Step 9's approach). 40
  `packages/sdk` tests (8 files, incl. the new `employee-registry-client`
  and `confirmation` — the latter backing the register-confirmation-wait
  described above), 15 `packages/shared` tests, 107 backend tests total
  (72 unit across 11 files + 35 integration/e2e across 5 files, incl. a
  real `employees.e2e-spec.ts` that creates a fresh organization on the
  live `payroll_factory`, links the owner's real wallet, and drives
  create→register→PATCH→update→deactivate plus CSV dry-run/commit against
  real Testnet). `turbo run build lint typecheck test` green across all
  16 tasks.

  **Known scope gaps, logged as debt, not blocking**: employee
  wallet-address changes have no implementation (the contract's
  `update_employee` has no wallet parameter at all — verified against the
  real Rust source; there's no bulk-register contract function either, so
  this was never a live option to "just add"). A salary/frequency `PATCH`
  made while the *initial* registration is still pending is Postgres-only
  and doesn't retroactively update the already-built register-intent XDR.
  Both detailed above in this debt log.

- [x] Step 11: Payroll engine — payroll run creation, preview, execution
      against `payroll_engine`, partial-failure handling.

  **`PAYROLL_CHUNK_SIZE` benchmarked for real** (`PAYROLL_ENGINE.md` §2's
  "default 25, to be tuned... recorded once benchmarked"). First attempt
  used simulation-only checks against employees with random, unfunded,
  non-trustlined wallets and got misleading results (`Budget,
  ExceededLimit` failing at just 10 items) — root cause: a payment that
  can't actually land makes `treasury.transfer_out`'s inner SAC transfer
  trap, and Soroban's simulated cost estimate for that trap-and-recover
  path doesn't reliably predict its real execution cost, so simulating a
  batch of *failing* payments isn't a valid proxy for benchmarking
  *succeeding* ones. Re-ran with real, funded, trustlined employees and
  real submission (not simulation alone): confirmed ceiling is exactly
  10 employees in one `run_payroll` transaction (11 fails simulation with
  `Memory(OutOfBoundsGrowth)`, cleanly catchable). Set to **8**, two below
  the confirmed ceiling as safety margin. Full methodology recorded in
  `PAYROLL_ENGINE.md` §2 in case this needs re-benchmarking later (e.g.
  contract changes, network resource-limit changes).

  **Chunking API shape**: `POST execute-intent` always builds the *next*
  unexecuted chunk only, never all chunks at once — confirmed as the only
  workable design, not a real fork: each chunk needs its own wallet
  signature, so there's no way to have chunk 2's XDR ready before chunk 1
  is submitted anyway. This also naturally implements
  `PAYROLL_ENGINE.md` §2's "sequential, not parallel, so a systemic
  failure is discovered after the first chunk" requirement — the §3
  proactive balance check re-runs before every chunk build, so an
  underfunded treasury halts the sequence with a clear `422
  INSUFFICIENT_TREASURY_BALANCE` (shortfall included) rather than firing
  more doomed chunks.

  **Backend module**: `PayrollController`/`Service`/`Repository`/
  `ChainAdapter` follow the layering Treasury/Employees established.
  `packages/sdk/src/stellar/payroll-engine-client.ts` builds
  `run_payroll` XDR against the real deployed network-wide singleton
  (`STELLAR_PAYROLL_ENGINE_CONTRACT_ADDRESS`, new config var, same
  pattern as `employee_registry`). `run_id` is derived per chunk as
  SHA-256(`${payrollRunId}-${chunkIndex}`) truncated to a `u64`
  (`run-id.util.ts`) — deterministic and not guessable without the exact
  Postgres ID, per `PAYROLL_ENGINE.md` §2's security note. `submitExecuteIntent`
  waits for the chunk's confirmation synchronously (same reasoning as
  Employees' register-confirmation wait: `run_payroll`'s `PayrollResult
  {succeeded, failed}` return value is needed immediately to mark each
  `PayrollItem` PAID/FAILED and derive the run's aggregate status, not
  deferred to Step 13's indexer). `common/utils/require-caller-address.ts`
  factored out of `employees.controller.ts` once Payroll needed the exact
  same "caller is always the acting user's own linked wallet" check — a
  real second consumer.

  **Real bugs/gaps found by end-to-end verification, each now covered by
  a regression test**:
  1. The `PAYROLL_CHUNK_SIZE` benchmarking methodology bug above — a
     genuine "verify against reality, not simulation alone" lesson.
  2. `packages/shared`'s `INTENT_TYPES`/`IntentType` mirror had gone
     stale — Step 10 added three new `IntentType` values to the Prisma
     enum without updating this shared copy (the backend imports
     `IntentType` from `@prisma/client` directly, so nothing caught the
     drift). Fixed, plus added `PAYROLL_EXECUTE`; both mirrors verified
     to actually match now.
  3. `API_SPECIFICATION.md`'s Payroll example showed
     `"totalAmount": "12500.0000000"` — `stroopsToDecimal` has always
     stripped trailing zeros and the decimal point entirely for a whole
     number (`"12500"`), a pre-existing doc/reality mismatch from before
     any endpoint returning a real payroll amount existed to catch it.
     Fixed.
  4. Added `PAYROLL_RUN_NOT_FOUND` (404) to `API_ERROR_STATUS_MAP` —
     genuinely missing, every other lookupable entity already had one.

  Verified: a real payroll run against the real deployed contracts —
  9 employees (`PAYROLL_CHUNK_SIZE + 1`, so a real run spans two chunks),
  registered and funded for real, treasury funded for real via the real
  Treasury API, full create → schedule → execute chunk 1 (8 items, PAID)
  → execute chunk 2 (1 item, PAID) → COMPLETED flow, plus a real `422
  INSUFFICIENT_TREASURY_BALANCE` case. 42 `packages/sdk` tests (9 files,
  incl. the new `payroll-engine-client`), 15 `packages/shared` tests, 134
  backend tests total (92 unit across 13 files + 42 integration/e2e
  across 6 files, incl. `payroll.e2e-spec.ts`). `turbo run build lint
  typecheck test` green across all 16 tasks.

  **Correction (Step 12)**: the item below, originally logged as "known
  real-network characteristic, not a bug," was wrong — it was a genuine,
  fixable sequence-number race (submitting a transaction only confirms
  mempool acceptance, not ledger application; chaining a same-account
  transaction before the prior one lands can reuse its sequence number).
  Diagnosed and fixed for real in Step 12 once the identical root cause
  surfaced in Milestones' state-machine transitions and got properly
  investigated instead of re-attributed to network noise. See Step 12's
  entry. Left the original (incorrect) note below as-written rather than
  deleting it, so this correction has something to point at.

  ~~**Known real-network characteristic, not a bug**: e2e tests that sign
  several consecutive transactions with the same account (e.g.
  `employees.e2e-spec.ts`'s create→update→deactivate sequence) very
  occasionally hit a transient failure on real Testnet — observed during
  this step's full-suite runs, always resolved on retry, always a
  different test each time. Consistent with the sequence-number/timing
  category of flakiness already noted in Step 9's history; not something
  `fileParallelism: false` (which fixed the *systematic*
  cross-file concurrency issue) can fully eliminate, since it's
  within a single file's sequential signing, not cross-file
  interference. No action taken — logging it here so a future flaky-test
  investigation doesn't start from zero.~~

- [x] Step 12: Milestone engine — full milestone state machine against
      `milestone_engine`.

  **Contractors CRUD moved up from Step 14, confirmed with you**: the
  `ContractorsController`/`Service` skeletons explicitly said "lands in
  Step 14," but `Milestone.contractorId` is a required FK and
  `CONTRACTOR_MODEL.md` §3 describes the create-milestone form reading a
  contractor's saved wallet from Postgres — Step 12 genuinely cannot be
  exercised end-to-end without it, same reasoning as Step 10 bundling CSV
  import in. Built now (Postgres-only, no on-chain registry per
  `CONTRACTOR_MODEL.md` §1-2); Step 14 no longer needs to touch it.

  **Funding is two on-chain calls exposed as one repeatable endpoint,
  confirmed as forced (not re-asked)**: `MILESTONE_ENGINE.md` §3 says
  `create_milestone` is "followed immediately by `fund_milestone`," but
  those can never be combined into one transaction (Soroban rejects more
  than one `InvokeHostFunction` operation per transaction — the same
  constraint discovered for CSV import's batch registration in Step 10).
  `POST fund-intent` therefore always builds the *next* needed step
  (`step: "create" | "fund"` in the response) and is called again after
  each submit — the same repeatable-endpoint shape Payroll's chunking
  already established, so this wasn't treated as a fresh design fork.
  `approve-intent`/`release-intent`/`cancel-intent` each got the same
  build/submit intent pair the rest of the system already uses, even
  though `API_SPECIFICATION.md`'s original table listed `approve` as a
  single endpoint — that table was simply under-specified (same category
  of gap as Employees' originally-missing submit endpoints in Step 10),
  not a real design question, since "requires a wallet signature" only
  ever means build-then-submit in this codebase. `cancel-intent` follows
  Employees' deactivate precedent: Postgres-only with no intent at all
  when nothing was ever `create_milestone`'d on-chain yet, a real
  build/submit pair once it was (`Milestone.onChainMilestoneId` set).

  `IntentService.validateForSubmit`/`submitAndConsume` extended to accept
  a list of expected types, not just one — `fund-intent/:intentId/submit`
  is one endpoint fronting either a `MILESTONE_CREATE` or `MILESTONE_FUND`
  intent, and the caller doesn't know in advance which. `common/utils/require-caller-address.ts`
  (Step 11) reused directly, no changes needed.

  **A real bug found via end-to-end testing, and its full story**:
  `approve` then immediately `release` failed with a misleading `502
  SIMULATION_FAILED` — `release_milestone`'s `assert_transition` re-checks
  *current on-chain* status, but `submitSignedXdr` only confirms mempool
  acceptance, not ledger application, so the release simulation could run
  before the approve had actually landed. Fixed by having every Milestones
  submit method (`fund`/`approve`/`release`/`cancel`) wait for real
  confirmation before returning, and only update Postgres status if it
  actually confirmed (`MilestonesChainAdapter.waitForConfirmedSuccess`) —
  the same "leave state untouched if unconfirmed" pattern Payroll's
  `reconcileChunk` already established.

  Chasing this down led to re-examining a claim from Step 11's own entry:
  "e2e tests that sign several consecutive transactions with the same
  account very occasionally hit a transient failure... no action taken."
  That was wrong. It's the identical root cause (a still-pending prior
  transaction's sequence number gets reused by the next one, built too
  soon), just manifesting differently — Employees' `update`→`deactivate`
  chain has no on-chain status precondition to trip `SIMULATION_FAILED`
  on, so it surfaced instead as `502 CHAIN_SUBMISSION_FAILED` at *submit*
  time (`txBadSeq`), which looked enough like generic network noise to
  get written off rather than investigated. Fixed for real in this step:
  `EmployeesChainAdapter.waitForConfirmedSuccess` (new) is now awaited in
  `submitUpdateIntent`/`submitDeactivateIntent` before returning (matching
  `submitRegisterIntent`, which was already safe — it needed the register
  confirmation wait for the return value anyway). Both fixes verified by
  running the affected e2e suites clean twice in a row after the change,
  not just once. Corrected in place in Step 11's entry above rather than
  silently rewritten, so the historical record stays honest about what
  was actually known at the time.

  Two error codes added because they were genuinely missing, matching
  every other lookupable entity: `CONTRACTOR_NOT_FOUND`, `MILESTONE_NOT_FOUND`.

  Verified: a real milestone through the full
  DRAFT→(create)→(fund)→FUNDED→APPROVED→RELEASED lifecycle, plus
  cancellation from DRAFT (Postgres-only, no signature) and from FUNDED
  (real on-chain refund) — all against the real deployed `milestone_engine`
  and a real Contractor created through the real Contractors API. 48
  `packages/sdk` tests (10 files, incl. the new `milestone-engine-client`),
  15 `packages/shared` tests, 165 backend tests total (116 unit across 15
  files + 49 integration/e2e across 7 files, incl. `milestones.e2e-spec.ts`).
  `turbo run build lint typecheck test` green across all 16 tasks.

- [x] Organizations module (the "org management" third of Step 14, pulled
      forward ahead of Step 13 — same precedent as Contractors moving from
      Step 14 to Step 12): `POST /organizations` was the one resource every
      other nested route (`/organizations/:orgId/...`) already depended on,
      and no client could create or select an org at all without it.

  **Forced deviation from `API_SPECIFICATION.md`'s Organizations table,
  confirmed as forced (not re-asked)**: the doc shows `POST /organizations`,
  `POST .../members`, `PATCH .../members/:memberId`, and
  `DELETE .../members/:memberId` as single synchronous calls. All four
  actually call a contract method with `require_auth()` on a wallet the
  backend never holds (`owner` for `create_organization`, the acting
  ADMIN/OWNER for `grant_role`/`revoke_role`) — there is no custodial
  signing path anywhere else in this system, so each had to become the same
  build-XDR/sign-client-side/submit-signed-XDR pair every other on-chain
  mutation already uses (`.../create-intent` + `.../create-intent/:intentId/submit`,
  and similarly `members/add-intent`, `members/:memberId/role-intent`,
  `members/:memberId/remove-intent`). Same category of doc under-specification
  as Milestones' `approve-intent` in Step 12.

  **A real schema constraint, not a design choice**: `Intent.organizationId`
  was a required FK, but an `ORGANIZATION_CREATE` intent is built before any
  `Organization` row exists to reference. Made `Intent.organizationId`
  nullable (migration `20260714060725_organizations_module`) and widened
  `IntentService`/`IntentRepository` to accept `string | null` — every other
  intent type still always passes a real organizationId, so this is a pure
  widening, not a behavior change for Treasury/Employees/Payroll/Milestones.
  `name`/`slug`/`salt` ride in the pending intent's `metadata` JSON since
  there's nowhere else to put them until the org exists.

  Two new `IntentType` values (`ORGANIZATION_GRANT_ROLE`,
  `ORGANIZATION_REVOKE_ROLE`) and two new error codes
  (`USER_NOT_FOUND`, `MEMBER_NOT_FOUND`) added because they were genuinely
  missing, matching every other lookupable entity. A new
  `packages/sdk/src/stellar/payroll-factory-client.ts` (create_organization
  + read-only get_organization) and `organization-client.ts` (grant_role/
  revoke_role against the per-org contract, since `organization` is deployed
  dynamically like `treasury`) — the first SDK clients to pass a `BytesN<32>`
  argument (the deploy salt, a random 32-byte `Buffer`) and the first to map
  this system's `OrgRole` strings to the contract's PascalCase `Role` enum
  symbols (`OWNER` → `"Owner"`, etc).

  Proactive last-owner protections added in Postgres before ever building
  XDR (mirroring Payroll's proactive treasury-balance check): demoting or
  removing the sole remaining `OWNER` throws `422 INVALID_STATE_TRANSITION`
  instead of reaching the contract's own `CannotRevokeLastOwner` check and
  surfacing as an opaque `SIMULATION_FAILED`.

  **Not verified against real Testnet in this session** (unlike every prior
  step's entry above) — no real `create_organization`/`grant_role`/
  `revoke_role` call has actually been submitted yet, only unit-tested
  against mocked repository/chain-adapter fakes. Verified: `turbo`-equivalent
  `tsc --noEmit`/`eslint` clean across `packages/shared`, `packages/sdk`,
  `apps/backend`; 133 backend unit tests passing (121 prior + 12 new
  `organizations.service.spec.ts`), including a from-scratch migration
  replay in the Vitest test-DB setup. No `organizations.e2e-spec.ts` yet —
  that, plus a real end-to-end Testnet run (the same discipline every prior
  step applied before calling itself done), is the natural next increment
  before treating Organizations as fully proven, not just implemented.

  **Follow-up (same day)**: `organizations.e2e-spec.ts` written and run
  clean against real Testnet (14 tests — create/list/get/update, member
  add/role-change/remove, SLUG_TAKEN, USER_NOT_FOUND, last-owner
  protection). Found and fixed two real bugs surfaced only by a genuine
  end-to-end run against the real deployed contracts (unit tests with
  mocked fakes couldn't have caught either):
  1. `payroll-factory-client.ts`'s `get_organization` returns
     `Result<OrgRecord, WorkforceError>`, which decodes as `{ value:
     OrgRecord }`, not a flat record — confirmed against
     `test/helpers/testnet-fixtures.ts`'s `createTestOrganization`, which
     already needed the same unwrap.
  2. `organization-client.ts`'s `grant_role` passed the `Role` enum as a
     plain PascalCase string (`"Hr"`); soroban_sdk's JS encoding for a
     fieldless contract enum actually needs `{ tag: "Hr", values:
     undefined }` (same shape as `employee-registry-client.ts`'s
     `PayFrequencyScVal`, which the payroll-factory client should have
     matched from the start — the plain-string version threw `TypeError:
     no such enum entry: undefined`).
  Also found: `test/setup-env.ts`'s `STELLAR_FACTORY_CONTRACT_ADDRESS`
  was a dummy placeholder (no prior test path called `payroll_factory`
  directly) — swapped for the real deployed address, matching how
  `STELLAR_USDC_SAC_ADDRESS` etc. were already real for the same reason.

- [x] Step 13: Event indexer — BullMQ-backed polling of Stellar RPC events
      into the `Transaction`/`Milestone` projections, per
      [EVENT_INDEXING.md](./EVENT_INDEXING.md) (§8 there has the full list
      of corrections against that doc's original design — summarized
      here). `@nestjs/bullmq` + `bullmq` added; `REDIS_URL` changed from
      optional to defaulting to `redis://localhost:6379` (load-bearing
      now, but existing envs without it set still boot). New
      `packages/sdk/src/stellar/events-client.ts` (`getContractEvents`/
      `getLatestLedgerSequence`) and `packages/shared/src/constants/events.ts`
      (topic name constants mirroring `common::events` byte-for-byte,
      verified against a real emitted `org_created` event before writing
      any parsing code — RPC's actual wire shape is `topic: [eventName,
      ...#[topic] fields]`, `value: {...remaining fields by name}`, found
      by fetching real events off the live `payroll_factory` deployment
      rather than guessing from the Rust macro's behavior).

  Real schema/behavior corrections found implementing this (not
  speculative — each traced to an actual constraint or a real Testnet
  response): `Intent`-style nullable-FK precedent extended to
  `Transaction.stellarEventId` replacing `stellarTxHash` as the upsert
  key (one tx can emit several relevant events); treasury-vs-milestone_engine
  event de-duplication (treasury alone inserts `Transaction` rows;
  milestone_engine's own events only update `Milestone.status`); payroll
  status reconciliation intentionally NOT implemented (on-chain `run_id`
  is a one-way hash with no persisted reverse mapping — Payroll's own
  Step-11 synchronous reconciliation remains authoritative); a genuine
  Testnet RPC quirk where `getEvents`' indexing frontier can lag behind
  `getLatestLedger()`'s consensus view, treated as "nothing new yet" not
  a failure; no historical backfill for a contract the indexer has never
  seen before (cursor baselines at "now").

  Verified: `indexer.e2e-spec.ts` — a real deposit against a real
  deployed `treasury` contract, materialized into a `Transaction` row by
  a real (not simulated) `IndexerService.pollAll()` call, including
  idempotency across cursor rewind/reprocessing. 10 new
  `indexer.service.spec.ts` unit tests. Full app boot confirmed clean
  with BullMQ/Redis wired into `AppModule` (all existing e2e suites still
  pass).

- [x] Step 14 (remainder — Organizations already covered above;
      Contractors/CSV moved to Step 12 earlier): Transactions, Analytics,
      OpenAPI generation.

  **Transactions**: `GET /organizations/:id/transactions`, paginated
  (`{data, meta: {page, pageSize, total}}` — the first module to actually
  use `packages/shared`'s `paginationQuerySchema`/`paginatedResponseSchema`
  helpers, scaffolded back in Step 1 but unused until now), filterable by
  `type`/`status`/`from`/`to`. Pure read over the Indexer's own
  projection — no chain adapter, matching Contractors' precedent that a
  pure-Postgres module doesn't need its own e2e spec (no `transactions.e2e-spec.ts`,
  same as no `contractors.e2e-spec.ts`).

  **Analytics**: all four endpoints implemented against real Postgres
  aggregation (`overview`, `payroll-trends`, `treasury-flow`,
  `department-spend` — exact response shapes now in
  [API_SPECIFICATION.md](./API_SPECIFICATION.md)'s Analytics section,
  since the original table only named the endpoints). `overview`'s
  treasury balance is the only chain call in this module (live-read, same
  as Treasury's own overview) — the other three are pure Postgres,
  bucketed into trailing-6-month, zero-filled series. All decimal sums go
  through `packages/sdk`'s `decimalToStroops`/`stroopsToDecimal` (raw
  bigint arithmetic) rather than floating point or `Prisma.Decimal`'s own
  arithmetic API.

  **OpenAPI generation**: `@nestjs/swagger` wired into `main.ts` —
  `SwaggerModule.setup("api/docs", ...)`, unaffected by the `/api/v1`
  global prefix since it mounts directly on the HTTP adapter rather than
  through a Nest controller, matching
  [OPENAPI_SPEC.md](./OPENAPI_SPEC.md)'s stated `/api/docs` +
  `/api/docs-json` endpoints exactly. Scoped to wiring generation up from
  existing controller/route decorators, not hand-annotating every Zod-inferred
  DTO with `@ApiProperty` (Zod already validates; that would be a large,
  largely redundant parallel type system) — logged as a real, deliberate
  scope boundary, not an oversight. New `openapi.integration-spec.ts`
  boots the real `AppModule` and asserts the generated document covers
  every documented resource group; CI diff-checking this against
  `OPENAPI_SPEC.md`'s skeleton is Step 19's job, not built here.

  Verified: `turbo run build lint typecheck test` green across all
  packages (`packages/shared`, `packages/sdk`, `apps/backend`) including
  every real-Testnet e2e suite (treasury/employees/payroll/milestones/organizations/indexer).

- [x] Step 15: Frontend (`apps/frontend`, Next.js 15 App Router) — built in
      a separate session per `IMPLEMENTATION_PROMPT_FRONTEND.md`, then
      brought to real testnet-readiness in a follow-up gap-finding pass:
      every route in the spec exists, `useSignAndSubmit`'s 5-stage flow is
      real and shared across every money-moving feature, design tokens
      match, forms use `packages/shared` schemas.

  **Real, confirmed bugs found only by actually running the app against
  the real backend (unit tests / typecheck alone couldn't catch these —
  they're all runtime request-shape or wiring mismatches)**:
  1. **No CORS at all** — `main.ts` never called `app.enableCors()`, so
     every client-side (browser) fetch from the frontend's different
     origin would fail preflight. Added `FRONTEND_ORIGINS` config
     (defaults to `http://localhost:3000`) and `app.enableCors({ origin,
     credentials: true })`; `lib/api/client.ts`'s `clientFetch` was
     missing `credentials: "include"` to match (session cookie never
     would have been sent cross-origin otherwise).
  2. **Milestones/Payroll-runs/Members list pages always rendered
     empty** — `useMilestones`/`usePayrollRuns`/`useMembers` were typed
     `{ data: T[], meta }` and every consumer read `data?.data || []`,
     but those three backend endpoints return a plain array (matching
     Employees/Contractors' convention — only Transactions is actually
     paginated). Fixed the query types and the `|| []` fallbacks to match
     backend reality rather than an assumed-but-wrong envelope shape.
  3. **`ChangeRoleDialog`/`RemoveMemberDialog` used `member.userId` as
     the `:memberId` URL param** — the backend
     (`OrganizationsRepository.findMemberById`) looks members up by the
     `OrganizationMember` row's own `id`, not the linked `User`'s id;
     every role-change/remove-member action would have 404'd.
  4. **`InviteEmployeeDialog`/`UpdateSalaryDialog` posted to a
     nonexistent submit URL** (`.../employees/intent/:intentId/submit`)
     instead of the real
     `.../employees/:employeeId/register-intent/:intentId/submit` (or
     `update-intent`) — employee registration/salary-update would always
     404 on submit.
  5. **`useSignAndSubmit`'s error-code branches were all dead code** —
     `formatError` matched `error.message.includes("INTENT_EXPIRED")`
     etc., but every dialog threw `new Error(err.message)` using the
     backend's human-readable message, never the machine `error` code
     field. Every specific error branch (410/409/502/422) was
     unreachable; users only ever saw either the raw message or the
     generic fallback. Fixed by adding `lib/api/errors.ts`'s `ApiError`
     (carries `.code` from the response body) and switching all ten
     `useSignAndSubmit` call sites from `throw new Error(err?.message ||
     ...)` to `await throwApiError(res, ...)`; `formatError` now
     switches on `.code`. Also added a 60-attempt cap to confirmation
     polling (previously an infinite loop if a status never reached
     terminal).
  6. **A genuine UX deadlock for email/password users**: creating an
     organization requires `owner.require_auth()` (a real wallet
     signature), but the only wallet-linking surface in the original
     build (Settings' Security tab) lived under `/org/[orgId]/settings`
     — which requires an org to already exist. An email/password user
     had no route to ever acquire a linked wallet. Added `GET
     /auth/session` (the frontend previously had no way to learn "who is
     logged in" at all — the session cookie is httpOnly) and a shared
     `ConnectWalletCard` (drives `/auth/wallet/link`'s
     challenge/sign/link flow) gating the onboarding page's "Create
     Organization" step, plus the originally-missing Settings Security
     section.
  7. **Root `/` never checked auth at all** — it only ever read a cached
     `lastOrgId` from `localStorage` and fell back unconditionally to
     `/login`, meaning a freshly authenticated user with zero orgs (every
     brand-new signup) was sent to `/login` instead of `/onboarding`.
     Rewrote it to check `/auth/session` then the real org list before
     deciding between dashboard/onboarding/login.
  8. Role-based UI gating (docs/PERMISSION_MODEL.md) didn't exist
     anywhere — no client-side code ever fetched the caller's role. Added
     `useMyRole(orgId)` (derives role from the members list + `/auth/session`)
     and applied it to Treasury's deposit/withdraw buttons and Settings'
     member-management/rename actions — the highest-value, explicitly
     flagged spots; other pages' actions still rely solely on the
     backend's real `@MinRole` enforcement for now (correct per
     docs/PERMISSION_MODEL.md's "UX only" framing, just not yet
     hidden/disabled client-side everywhere).

  Verified end-to-end in a real (headless) browser via Playwright,
  against the real backend and real Testnet-deployed contracts, not
  mocks: register → login → root-redirect logic → onboarding →
  wallet-connect gate, with zero console errors and zero failed/4xx/5xx
  requests at every step up to the point a real Freighter browser
  extension becomes required (which a headless CI-style environment
  cannot provide) — confirmed CORS, cookies, auth, and error-surfacing
  all work correctly together, not just in isolation. Backend: 210
  tests passing (153 unit/integration + real e2e suites), `next build`
  clean.

- [ ] Steps 16–21: not started

See [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md#documentation-index) for
the full documentation index.
