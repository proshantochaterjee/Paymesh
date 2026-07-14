# Logging

## 1. Format

Structured JSON logs (pino, via `nestjs-pino`) to stdout in all
environments — no environment-specific log format branching, so local
dev, CI, and production (Railway/Render) all consume logs the same way,
optionally pretty-printed locally through a dev-only transform.

## 2. Required fields

Every log line includes: `timestamp`, `level`, `message`, `context`
(module name), `correlationId` (propagated from the inbound request's
`X-Request-Id` header, generated if absent), and, when available,
`organizationId` and `userId` (never the user's email or wallet secret
material).

## 3. Log levels

| Level | Used for |
|---|---|
| `error` | Unhandled exceptions, chain submission failures, indexer reconciliation mismatches |
| `warn` | Recoverable anomalies (unknown event type skipped, retryable RPC failure) |
| `info` | Request start/end, successful mutating operations (payroll executed, milestone released), indexer cursor advancement |
| `debug` | Simulation results, intent lifecycle detail — enabled only in non-production |

## 4. What never gets logged

- Private keys (never present in the backend at all — see
  [SECURITY_MODEL.md](./SECURITY_MODEL.md)).
- Full signed transaction XDR bodies at `info` level (logged at `debug`
  only, since they contain a valid signature that, combined with replay
  within its validity window, has value to an attacker who captures logs).
- Passwords, session tokens, JWTs — redacted by a pino redaction path list
  applied globally (`req.headers.authorization`, `body.password`, etc.).

## 5. Correlation across services

The same `correlationId` flows: frontend generates one per user action ->
sent as `X-Request-Id` to the backend -> backend propagates it into any
chain-adapter/SDK calls it makes and into the audit log entry it writes ->
if a chain submission later surfaces in the Event Indexer, the indexer logs
the `stellarTxHash` which cross-references back to the `Transaction` row
that stores the original `correlationId`, so a support investigation can
walk from "user complained about payroll run X" to every log line touching
it.

## 6. Retention & access

MVP: rely on the hosting platform's default log retention
(Railway/Render/Vercel) — no separate log aggregation service is in
scope. This is called out explicitly as a known limitation for a
production (non-Testnet-demo) deployment in
[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).

## 7. Metrics (out of MVP scope, noted for completeness)

No dedicated metrics/APM system (e.g., Prometheus, Datadog) ships in the
MVP. The `AuditLog` table and structured logs are sufficient for the
SCF-demo scale of this project; adding metrics is a straightforward
addition later since all services already emit structured logs with
consistent fields to build dashboards from.
