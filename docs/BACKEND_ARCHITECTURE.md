# Backend Architecture

NestJS application at `apps/backend`. Organized by bounded context
(domain module), each following the same internal layering to keep Clean
Architecture / DDD boundaries consistent across modules.

## 1. Module layering (per domain module)

```
modules/<domain>/
├── <domain>.module.ts        # NestJS module wiring
├── <domain>.controller.ts    # HTTP layer: routing, DTO validation, auth guards
├── <domain>.service.ts       # Application layer: use-case orchestration
├── domain/
│   ├── entities/              # Domain entities (plain TS, no Prisma types leaking in)
│   └── rules/                 # Pure business rules/invariants (e.g., payroll snapshot rule)
├── infra/
│   ├── <domain>.repository.ts # Prisma-backed persistence, implements a domain-defined interface
│   └── <domain>-chain.adapter.ts # Wraps packages/sdk calls relevant to this domain
├── dto/                       # Zod-validated request/response DTOs
└── <domain>.spec.ts
```

- **Controllers** never call Prisma or `packages/sdk` directly — only
  services.
- **Services** depend on repository/chain-adapter **interfaces**, not
  concrete Prisma/SDK classes (dependency inversion — NestJS DI binds the
  concrete implementation), so services are unit-testable with in-memory
  fakes.
- **Domain entities/rules** have zero framework imports (no `@nestjs/*`,
  no `@prisma/client`) — pure TypeScript, so business rules (e.g., "a
  payroll item snapshots salary at run-creation time") are testable
  without spinning up Nest's DI container.

## 2. Module list

`auth`, `organizations`, `treasury`, `employees`, `contractors`,
`payroll`, `milestones`, `transactions`, `analytics`, `indexer`. Each maps
1:1 to an API resource group in
[API_SPECIFICATION.md](./API_SPECIFICATION.md), except `indexer`, which
has no public HTTP surface and runs as a BullMQ processor registered in
the same Nest application context (see
[EVENT_INDEXING.md](./EVENT_INDEXING.md)).

## 3. Cross-cutting infrastructure (`common/`)

- **Guards**: `AuthGuard` (validates session/JWT), `OrgRoleGuard` (reads a
  `@MinRole(Role.FINANCE)` decorator on the route handler and checks the
  caller's `OrganizationMember.role` for the org in the URL — `:orgId` for
  nested resource controllers (treasury, employees, ...; their whole route
  prefix is scoped that way, e.g. `organizations/:orgId/treasury`) or `:id`
  for the organization resource's own routes (`/organizations/:id`);
  centralizing the RBAC check described in
  [PERMISSION_MODEL.md](./PERMISSION_MODEL.md) instead of duplicating it
  per controller method).
- **Interceptors**: `RequestLoggingInterceptor` (structured request/response
  logs with a correlation ID), `AuditLogInterceptor` (declarative
  `@Audited('EMPLOYEE_CREATED')` decorator writes an `AuditLog` row after a
  successful mutating request).
- **Filters**: `AllExceptionsFilter` maps domain errors and Prisma/chain
  errors to the standard error response shape in
  [ERROR_HANDLING.md](./ERROR_HANDLING.md).
- **Pipes**: `ZodValidationPipe` — validates request bodies/params against
  schemas imported from `packages/shared`.

## 4. Chain interaction boundary

Only `infra/*-chain.adapter.ts` files (one per module that needs chain
access: `treasury`, `employees` for registry writes, `payroll`,
`milestones`) import `packages/sdk`. This means:
- The rest of the backend has no idea Stellar exists — a service asks its
  chain adapter for "an intent to fund this milestone" and gets back
  `{ intentId, unsignedXdr }` without knowing how that XDR was built.
- Swapping RPC providers or SDK versions touches only these adapter files
  plus `packages/sdk` itself.

## 5. Intent/submission pattern implementation

Each chain-mutating adapter implements two methods mirroring the API
pattern in [API_SPECIFICATION.md](./API_SPECIFICATION.md):
`buildIntent(...) -> { intentId, unsignedXdr, expiresAt }` (simulates via
RPC, persists a short-lived `Intent` row keyed by `intentId` with the
expected operation + expiry) and `submitIntent(intentId, signedXdr) ->
{ stellarTxHash }` (validates the intent hasn't expired/been consumed,
submits, marks it consumed, returns immediately without blocking on final
confirmation — confirmation is the Event Indexer's job).

`Intent` is a short-lived Postgres table (not listed in
[DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)'s core entities since it's
ephemeral infrastructure state, TTL-cleaned by a scheduled job) rather than
in-memory, so intents survive a backend restart between build and submit.

The intent lifecycle itself (`create`/`validateForSubmit`/`submitAndConsume`/
`buildXdrOrThrow`) is generic across domains — factored into
`common/intent/intent.service.ts` + `intent.repository.ts` in Step 10 once
Employees needed the exact same logic Treasury already had (a real second
consumer, not speculative reuse). Each domain module (`treasury/`,
`employees/`) keeps its own thin repository for domain-specific reads
(treasury's balance/obligations, employees' org/employee lookups) and its
own chain adapter; only the intent CRUD and validation are shared.

One documented exception to "returns immediately... confirmation is the
Event Indexer's job": `employees/employees.service.ts`'s
`submitRegisterIntent` polls for confirmation synchronously
(`packages/sdk`'s `waitForTransactionConfirmation`, a few seconds) before
responding, because it needs the chain-generated `employee_id` back to
backfill `Employee.onChainEmployeeId` — unlike treasury balance (always
read fresh, no stored value to backfill), an employee's on-chain ID is a
value the rest of the system (payroll eligibility) depends on being
persisted, and Step 13's indexer doesn't exist yet to do this
asynchronously.

A second, distinct reason to wait for confirmation (not just to capture a
return value): a still-*submitted*-but-not-yet-*applied* transaction
hasn't advanced its signer's on-ledger sequence number yet, so building
and signing the *next* same-signer transaction too soon can reuse that
sequence number and fail at submit time. Milestones' state machine hits
this directly — `approve` immediately followed by `release` re-simulates
`release_milestone`'s `assert_transition` against current on-chain
status, which can still show the pre-`approve` state. Found via real
end-to-end testing in Step 12; fixed by having every Milestones submit
method wait for real confirmation (`MilestonesChainAdapter.waitForConfirmedSuccess`)
before returning, only updating Postgres status if it actually confirmed.
The identical root cause turned out to already be causing intermittent
`CHAIN_SUBMISSION_FAILED` failures in Employees' `update`→`deactivate`
chain (no on-chain status precondition there, so it surfaced as a
sequence error rather than a simulation error) — misdiagnosed as generic
network flakiness in Step 11, fixed for real in Step 12 alongside the
Milestones fix (`EmployeesChainAdapter.waitForConfirmedSuccess`, same
pattern). Any future module chaining multiple same-signer on-chain calls
in sequence should wait for confirmation between them for this reason,
not just when a return value happens to be needed.

## 6. Why NestJS modules mirror API resources, not database tables

`employees` module, for example, both serves `/employees` HTTP routes and
owns the chain adapter calling `employee_registry` — because the use case
("register an employee") spans both a DB write and a chain write
atomically from the caller's perspective, even though they're two separate
underlying operations (DB row created optimistically, then chain
registration; see [EMPLOYEE_MODEL.md](./EMPLOYEE_MODEL.md) for the exact
sequencing and failure-handling if the chain call fails after the DB write
succeeds).

## 7. Configuration

`@nestjs/config` with a validated (Zod) config schema at boot — the
process fails fast on missing/invalid env vars rather than failing later
on first use. Config groups: `database`, `auth` (JWT secret, session TTL),
`stellar` (network, RPC URL, Horizon URL, factory contract address, USDC
SAC address, `employee_registry` contract address — a network-wide
singleton per `BLOCKCHAIN_ARCHITECTURE.md` §2, so unlike per-org
`treasury` addresses this one lives in config, not the DB), `redis`
(defaults to `redis://localhost:6379` — load-bearing since Step 13's
Event Indexer runs its BullMQ job against it, no longer truly optional).
