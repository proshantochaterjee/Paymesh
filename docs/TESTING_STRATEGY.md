# Testing Strategy

## 1. Test matrix

| Layer | Tool | Scope | Coverage goal |
|---|---|---|---|
| Smart contracts | Rust `#[test]` + `soroban-sdk` test utilities | Every public function's happy path + every documented error variant | 100% of public functions have at least one happy-path and one per-error test |
| Backend unit | Vitest | Services, domain rules, DTO validation — with fake repositories/chain adapters (no real DB/RPC) | ≥85% line coverage on `modules/*/domain` and `modules/*/*.service.ts` |
| Backend integration | Vitest against a real Postgres server (see §2 — no Docker/Testcontainers) | Repository queries, Prisma migrations apply cleanly, full controller-to-DB round trip. For endpoints with a real on-chain component (Treasury, Employees), the chain adapter is real too — a throwaway org created on the real deployed contracts, not stubbed, since the whole point is proving the unsigned-XDR-build → sign → submit → confirm round trip actually works (a stub can't catch a Soroban-side rejection) | Every API endpoint in [API_SPECIFICATION.md](./API_SPECIFICATION.md) has at least one integration test |
| Contract integration | Rust integration tests against a local Soroban sandbox (or `soroban-sdk`'s `Env::default()` in-process ledger) | Multi-contract flows: factory deploys org, org grants role, treasury receives deposit, payroll_engine pays from it | Every cross-contract call path in [SEQUENCE_DIAGRAMS.md](./SEQUENCE_DIAGRAMS.md) has a covering test |
| Frontend unit/component | Vitest + React Testing Library | Components, hooks (`useSignAndSubmit`, form validation) | Critical interactive components (forms, wizards, StatusBadge) covered |
| End-to-end | Playwright | Full user flows against a running stack (frontend + backend + Postgres + local Stellar sandbox or a pinned Testnet fixture org) | Every flow in [USER_FLOWS.md](./USER_FLOWS.md) has one passing e2e test |

## 2. Test environments

- **Contracts**: `soroban-sdk`'s built-in test `Env` for unit tests (no
  network); a local Stand-alone/Futurenet sandbox container for
  integration tests that need realistic ledger/event behavior.
- **Backend**: unit tests use fakes/mocks, no real DB. Integration tests
  (`test/*.integration-spec.ts`) connect to a locally-configured Postgres
  server (the same one used for local dev — `DATABASE_URL`'s host/role,
  a `CREATEDB`-capable role) and create/drop a throwaway database per test
  run rather than an ephemeral Testcontainers instance — decided in Step 7
  after Docker was repeatedly unavailable in the sandbox environment (see
  [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) technical debt log); CI
  provisions a real Postgres service container directly (not via
  Testcontainers-in-Docker) per [CI_CD.md](./CI_CD.md). The Stellar chain
  adapter is mocked/faked in unit tests and pointed at the
  contract-integration sandbox (or real Testnet with a dedicated
  throwaway test org) in integration tests. Vitest's
  `test.fileParallelism` is disabled (`vitest.config.ts`) — decided in
  Step 10 once a second real-Testnet e2e-spec file existed alongside
  Treasury's: running e2e-spec files in Vitest's default parallel worker
  pool meant two files could call the same real `payroll_factory` at once
  and intermittently get back a malformed RPC simulation response.
  Confirmed as a concurrency artifact (each file passes reliably alone);
  serializing file execution costs some wall-clock time but removes a
  real-network flakiness source entirely.
- **E2E**: `docker-compose.test.yml` spins up frontend + backend +
  Postgres against real Stellar Testnet (using pre-funded Testnet test
  accounts via Friendbot), since e2e's entire point is proving the real
  integration works.

## 3. What "done" means per module (ties to DEVELOPMENT_PLAN.md checklist)

A module is not complete until: its own unit tests pass, any integration
tests touching it pass, and — for anything reachable from the UI — the
relevant Playwright scenario passes. CI ([CI_CD.md](./CI_CD.md)) enforces
all three tiers on every PR; none are optional/"fix later."

## 4. Contract test example shape

```rust
#[test]
fn run_payroll_rejects_duplicate_run_id() {
    let env = Env::default();
    let (org_id, ctx) = setup_org_with_employees(&env, 3);
    let result1 = ctx.payroll_engine.run_payroll(&ctx.finance_admin, &org_id, &1u64, &ctx.employee_ids);
    assert!(result1.succeeded.len() == 3);

    let result2 = ctx.payroll_engine.try_run_payroll(&ctx.finance_admin, &org_id, &1u64, &ctx.employee_ids);
    assert_eq!(result2, Err(Ok(WorkforceError::RunAlreadyExecuted)));
}
```

## 5. Backend test example shape

```ts
describe('PayrollService.executeRun', () => {
  it('returns 422 INSUFFICIENT_TREASURY_BALANCE without submitting a chain call', async () => {
    const chainAdapter = fakeChainAdapter({ treasuryBalance: '1000' });
    const service = new PayrollService(fakeRepo(runWithTotal('1250')), chainAdapter);

    await expect(service.buildExecuteIntent(runId)).rejects.toThrow(InsufficientTreasuryBalanceError);
    expect(chainAdapter.buildIntent).not.toHaveBeenCalled();
  });
});
```

## 6. E2E scenario example (Playwright)

`payroll-run.spec.ts`: log in as Finance (Testnet-funded test wallet) →
create a payroll run for 2 seeded employees → execute → sign with a
scripted Freighter test-mode signer (Playwright's Freighter extension
automation, or a headless signer stub configured for e2e only) → assert
both `PayrollItem`s reach `PAID` within the polling timeout → assert the
transaction is visible in `/transactions` with a valid Testnet tx hash
link.

## 7. Non-goals

No load/performance testing infrastructure in MVP scope (small demo-scale
data volumes); no chaos/fault-injection testing beyond the documented
partial-failure paths already covered above.
