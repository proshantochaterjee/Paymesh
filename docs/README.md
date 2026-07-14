# WorkforceOS

**A programmable workforce finance operating system built on Stellar Testnet.**

WorkforceOS lets organizations — Web3 startups, DAOs, foundations, open-source
projects, remote companies, grant programs, and agencies — manage payroll,
contractor milestone payments, and treasury operations with the settlement
guarantees of a public blockchain and the usability of enterprise banking
software.

Organizational data (who your employees are, what departments exist, who
approved what) lives off-chain in PostgreSQL. Every movement of money —
deposits, payroll disbursement, milestone releases — happens exclusively
through audited Soroban smart contracts on Stellar. The backend is never in
possession of, and can never move, organizational funds.

## Why Stellar

- Sub-5-second finality and sub-cent fees make per-employee, per-milestone
  transactions economically viable at any payroll size.
- Stellar Asset Contracts (SAC) give native, fungible-token semantics to
  USDC on Stellar, so treasury and payroll logic can treat USDC like any
  other Soroban token without a custom bridge.
- Soroban's account-abstraction-friendly authorization model lets us express
  organization-scoped roles (Owner, Admin, Finance, HR) directly in contract
  logic instead of bolting access control onto a backend that "trusts" a
  database.

## Repository layout

```
apps/
  frontend/        Next.js 15 dashboard (App Router)
  backend/         NestJS API, auth, indexing, business logic
packages/
  contracts/       Soroban/Rust smart contract workspace
  shared/          Cross-cutting TypeScript types, Zod schemas, constants
  sdk/             TypeScript SDK: Stellar RPC/Horizon + backend API client
configs/           Shared eslint/tsconfig/tailwind base configs
docker/            Dockerfiles and docker-compose stacks
docs/              This documentation set (source of truth)
scripts/           One-off and CI utility scripts
.github/workflows/ CI/CD pipelines
```

## Documentation map

Start here, in this order, before touching implementation code:

1. [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) — what we're building and why
2. [PRODUCT_REQUIREMENTS_DOCUMENT.md](./PRODUCT_REQUIREMENTS_DOCUMENT.md) — scope, personas, MVP feature list
3. [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) — how the pieces fit together
4. [TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md) — stack decisions and rationale
5. [BLOCKCHAIN_ARCHITECTURE.md](./BLOCKCHAIN_ARCHITECTURE.md) and [SMART_CONTRACT_SPECIFICATION.md](./SMART_CONTRACT_SPECIFICATION.md) — on-chain design
6. [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) and [API_SPECIFICATION.md](./API_SPECIFICATION.md) — off-chain design
7. [SECURITY_MODEL.md](./SECURITY_MODEL.md) and [THREAT_MODEL.md](./THREAT_MODEL.md) — before writing a single handler
8. Everything else, as needed per module (see each doc's own cross-links)

The full index of documents lives in [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md#documentation-index).

## Ground rules

- **Documentation is the source of truth.** If code and docs disagree, docs
  win until a PR updates both together.
- **Backend never owns funds.** All asset movement is authorized and
  executed by Soroban contracts; the backend only reads chain state and
  submits transactions that users/orgs have signed.
- **Clean separation of concerns**: blockchain, backend, frontend, database,
  and infrastructure are independently deployable and independently
  testable.
- **No placeholder code.** Every module ships with tests and docs before
  it is considered done.

## Status

Implementation in progress. See [ROADMAP.md](./ROADMAP.md) and
[DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) for sequencing and current
milestone.

## License

MIT — see [LICENSE](../LICENSE).
