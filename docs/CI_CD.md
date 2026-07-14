# CI/CD

## 1. Workflows

```
.github/workflows/
├── ci.yml         # every push/PR: lint, typecheck, unit+integration tests, build
├── contracts.yml  # every push/PR touching packages/contracts: cargo fmt/clippy/test
└── deploy.yml     # on tag/main merge: deploy contracts (if changed) + backend + frontend
```

## 2. `ci.yml` (summary)

```yaml
name: CI
on: [pull_request, push]
jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx turbo run lint typecheck

  backend-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_PASSWORD: test, POSTGRES_DB: test }
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx turbo run test --filter=backend
        env: { DATABASE_URL: postgresql://postgres:test@localhost:5432/test }

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx turbo run test --filter=frontend

  build:
    needs: [lint-typecheck, backend-tests, frontend-tests]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx turbo run build

  e2e:
    needs: [build]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker compose -f docker-compose.test.yml up -d --build
      - run: npx playwright test
      - run: docker compose -f docker-compose.test.yml down
```

## 3. `contracts.yml` (summary)

```yaml
name: Contracts
on:
  pull_request:
    paths: ["packages/contracts/**"]
  push:
    paths: ["packages/contracts/**"]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: wasm32v1-none }
      - run: cargo fmt --manifest-path packages/contracts/Cargo.toml -- --check
      - run: cargo clippy --manifest-path packages/contracts/Cargo.toml --all-targets -- -D warnings
      - run: cargo build --manifest-path packages/contracts/Cargo.toml --target wasm32v1-none --release
      - run: cargo test --manifest-path packages/contracts/Cargo.toml
```

Build runs before test: `payroll_factory`'s own test suite imports `organization`/`treasury`'s compiled WASM via `soroban_sdk::contractimport!` to exercise `create_organization`'s real cross-contract deploy (Soroban has no way to deploy a contract in tests without real bytecode), so that WASM must already exist on disk before `cargo test` runs.

## 4. `deploy.yml` (summary)

Triggered on merge to `main` (frontend/backend auto-deploy) and on
version tags matching `contracts-v*` (contract redeploy, manual/deliberate
since contract deploys are rare and consequential):

```yaml
name: Deploy
on:
  push:
    branches: [main]
    tags: ["contracts-v*"]
jobs:
  deploy-contracts:
    if: startsWith(github.ref, 'refs/tags/contracts-v')
    runs-on: ubuntu-latest
    environment: testnet
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: wasm32v1-none }
      - run: ./scripts/deploy-contracts.sh
        env:
          STELLAR_NETWORK: testnet
          DEPLOYER_SECRET_KEY: ${{ secrets.TESTNET_DEPLOYER_SECRET_KEY }}

  deploy-backend:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: railway up --service backend
        env: { RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }} }

  deploy-frontend:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }}
```

## 5. Branch protection

`main` requires: `ci.yml` passing (all jobs), at least one review approval,
up-to-date branch before merge. Contract changes additionally require the
PR author to check off the [SMART_CONTRACT_SPECIFICATION.md](./SMART_CONTRACT_SPECIFICATION.md)
per-contract testing-strategy checklist in the PR description (enforced by
review, not tooling, for MVP).

## 6. Secrets inventory used by CI

`TESTNET_DEPLOYER_SECRET_KEY`, `RAILWAY_TOKEN`, `VERCEL_TOKEN`,
`DATABASE_URL` (staging, for migration-check jobs if added later) — all
stored as encrypted GitHub Actions secrets, scoped to the `testnet`
deployment environment with required-reviewer protection on that
environment for the contract-deploy job specifically, since it's the
highest-consequence pipeline step.
