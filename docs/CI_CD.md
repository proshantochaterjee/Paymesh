# CI/CD

The repository uses one GitHub Actions workflow:

```
.github/workflows/
└── ci.yml  # sequential CI/CD pipeline for source validation, quality, tests, build, and deployment readiness
```

## Pipeline Order

The workflow is intentionally sequential so the GitHub Actions graph shows a full pipeline instead of one basic all-in-one job:

1. `01 - Validate source and lockfiles`
2. `02 - Prepare Node and Rust toolchains`
3. `03 - Lint and typecheck`
4. `04 - Validate database migrations`
5. `05 - Run unit, integration, and contract tests`
6. `06 - Build production artifacts`
7. `07 - Deployment readiness checks`
8. `08 - Pipeline complete`

## Runtime Requirements

The test and migration stages provision the services required by the app:

- PostgreSQL 16 with `workforceos_test`
- Redis 7 for BullMQ-backed backend tests
- Node.js 20 with `npm ci`
- Rust stable with the `wasm32v1-none` target for Soroban contract builds

The backend test setup uses the same database URL as CI:

```text
postgresql://postgres:password@localhost:5432/workforceos_test
```

## Test Strategy

The default CI test command is `npm run test:ci`. It runs deterministic checks that can pass from a clean GitHub-hosted runner:

- shared package tests
- SDK package tests
- Rust contract tests
- backend unit tests
- backend local integration tests for the app, OpenAPI contract, and Prisma migrations

Live Stellar Testnet end-to-end specs are intentionally excluded from the default CI gate. Those tests require the real `workforceos-deployer` secret key that matches `deployed-addresses.testnet.json`'s TUSDC issuer. Creating a new throwaway Stellar identity in CI is not valid for those specs because the generated account is not the deployed issuer and cannot satisfy the required TUSDC trustline/payment flow.

## Deployment Readiness

The final deployment-readiness job is non-destructive. It verifies whether optional deployment secrets are configured, but it does not deploy automatically. This keeps the pipeline green on pull requests and normal pushes while still showing the deployment stage in the Actions graph.

Optional secrets checked:

- `RENDER_API_KEY`
- `RENDER_SERVICE_ID`
- `VERCEL_TOKEN`
- `RAILWAY_TOKEN`
- `TESTNET_DEPLOYER_SECRET_KEY`

Add real deployment commands behind protected environments once the target infrastructure is finalized.
