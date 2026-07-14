# DevOps

Operational concerns beyond CI/CD pipeline mechanics (see
[CI_CD.md](./CI_CD.md)) and Docker build details (see
[DOCKER_SETUP.md](./DOCKER_SETUP.md)).

## 1. Environments

| Environment | Frontend | Backend | Database | Stellar network |
|---|---|---|---|---|
| Local dev | `localhost:3000` | `localhost:4000` | Docker Postgres | Testnet |
| PR Preview | Vercel preview URL | Railway/Render preview (or shared staging backend) | Shared staging Postgres (isolated schema per PR if feasible, else shared with care) | Testnet |
| Staging/Demo | Vercel (staging alias) | Railway/Render staging service | Dedicated staging Postgres | Testnet |
| Production (still Testnet for MVP) | Vercel (production) | Railway/Render production service | Dedicated production Postgres | Testnet |

There is no mainnet environment in this repository's scope.

## 2. Configuration management

All environment-specific values flow through environment variables,
validated at boot (see [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md)
§7) — no environment-conditional code branches beyond reading config
(`if (env === 'production')` style branching is avoided; behavior
differences are expressed as config values, not code paths, so staging
and production run identical code).

## 3. Database operations

- Migrations run as an explicit deploy step (`prisma migrate deploy`)
  before the new backend version starts serving traffic — never
  auto-applied by the app on boot in a way that could race multiple
  instances.
- Backups: rely on the managed Postgres provider's automated daily
  backups for MVP; no custom backup tooling.
- Seed data (`scripts/seed-db.ts`) only ever targets local/staging,
  guarded by an explicit `--allow-non-local` flag requirement to prevent
  accidental production seeding.

## 4. Monitoring (MVP scope)

- Platform-native uptime/health checks: `/health` endpoint on the backend
  (checks DB connectivity and, lightly, RPC reachability) polled by
  Railway/Render's built-in health check mechanism to auto-restart on
  failure.
- No external APM/alerting service in MVP — logs
  ([LOGGING.md](./LOGGING.md)) plus the treasury reconciliation job's
  `error`-level logs are the extent of automated anomaly surfacing.

## 5. Scaling posture

MVP is designed for demo/early-adopter scale (single backend instance,
single indexer instance) — not horizontally scaled. The Event Indexer is
explicitly a single active instance per contract-cursor set (running two
indexer instances against the same cursor would double-process events;
correct by virtue of idempotent upserts, but wasteful) — documented here
so a future move to multiple indexer instances knows to partition by
contract address rather than running duplicates.

## 6. Runbooks (minimal, MVP)

- **Backend down**: check `/health`, check Railway/Render deploy logs,
  redeploy last known-good build.
- **Indexer falling behind**: check `IndexerCursor.updatedAt` recency per
  contract via a direct DB query; restart the indexer service if stalled
  (cursor persistence means restart is always safe, per
  [EVENT_INDEXING.md](./EVENT_INDEXING.md) §3).
- **Treasury reconciliation mismatch alert**: manually cross-check the
  flagged org's balance against Stellar Expert directly; do not
  auto-correct — investigate first, since a mismatch could indicate an
  indexer bug or, more seriously, an unexpected chain-level event.

## 7. Infrastructure as code

MVP does not include Terraform/Pulumi — Railway/Render/Vercel projects are
configured through their dashboards/CLI directly, with configuration
(service names, env var names, not values) documented in
[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) so the setup is reproducible
by following that document, even without IaC tooling at this scale.
