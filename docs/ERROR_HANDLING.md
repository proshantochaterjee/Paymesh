# Error Handling

## 1. Standard error response shape (backend API)

```json
{
  "error": "INSUFFICIENT_TREASURY_BALANCE",
  "message": "Treasury balance (1,000 USDC) is insufficient for this payroll run (needs 1,250 USDC).",
  "details": { "shortfall": "250.0000000" }
}
```

- `error` is a stable, machine-matchable string (SCREAMING_SNAKE_CASE),
  used by the frontend to branch UI behavior (e.g., show a "fund
  treasury" CTA specifically for `INSUFFICIENT_TREASURY_BALANCE`).
- `message` is human-readable, safe to display directly.
- `details` is optional, structured, and error-specific.

## 2. Error categories and HTTP status mapping

| Category | Status | Examples |
|---|---|---|
| Validation | 400 | `VALIDATION_ERROR` |
| Auth | 401 | `UNAUTHENTICATED`, `INVALID_SIGNATURE` |
| Authorization | 403 | `FORBIDDEN_ROLE` |
| Not found | 404 | `ORGANIZATION_NOT_FOUND`, `EMPLOYEE_NOT_FOUND`, `PAYROLL_RUN_NOT_FOUND`, `CONTRACTOR_NOT_FOUND`, `MILESTONE_NOT_FOUND` |
| Conflict | 409 | `SLUG_TAKEN`, `INTENT_ALREADY_SUBMITTED`, `RUN_ALREADY_EXECUTED`, `WALLET_ALREADY_LINKED`, `EMAIL_ALREADY_REGISTERED` |
| Expired state | 410 | `INTENT_EXPIRED`, `CHALLENGE_EXPIRED` |
| Business rule | 422 | `INSUFFICIENT_TREASURY_BALANCE`, `INVALID_STATE_TRANSITION` |
| Upstream chain failure | 502 | `CHAIN_SUBMISSION_FAILED`, `SIMULATION_FAILED` |
| Unexpected | 500 | `INTERNAL_ERROR` |

## 3. Layered error translation

```
Contract error (e.g., E_INSUFFICIENT_BALANCE)
    -> packages/sdk translates Soroban error codes to typed SdkError subclasses
        -> chain adapter catches SdkError, maps to a domain error (InsufficientTreasuryBalanceError)
            -> service lets domain errors propagate (no silent catch)
                -> AllExceptionsFilter maps domain error -> HTTP response shape above
```

Each layer only knows about the layer directly below it — the NestJS
exception filter never inspects raw Soroban error codes, and
`packages/sdk` never knows about HTTP status codes. This keeps `sdk` reusable
outside the backend (e.g., from scripts) without dragging in
HTTP-specific error shaping.

## 4. On-chain error registry

Every contract error variant in
[SMART_CONTRACT_SPECIFICATION.md](./SMART_CONTRACT_SPECIFICATION.md) has a
globally unique numeric code (assigned in the `common` Rust crate) and a
corresponding entry in `packages/shared/src/constants/contract-errors.ts`
so `packages/sdk` can translate a raw Soroban `ContractError(N)` into a
named `SdkError` without string-matching panic messages.

## 5. Partial failure is not an error

Per [PAYROLL_ENGINE.md](./PAYROLL_ENGINE.md), a payroll run with some
failed items is a **successful** API call (`200`/`202`) whose response
body reports per-item outcomes — it is never represented as an HTTP error,
since the transaction itself succeeded and most items likely paid
correctly. The frontend renders per-item status, not a single pass/fail
banner.

## 6. Frontend error handling

- TanStack Query's `onError` for mutations maps known `error` codes to
  specific inline UI (e.g., a banner with a "Deposit funds" button for
  `INSUFFICIENT_TREASURY_BALANCE`).
- Unknown/unmapped error codes fall back to a generic toast with the
  `message` field — never a raw stack trace or `500` body shown to the
  user.
- Wallet-rejection (user declines to sign) is handled as a distinct
  client-side case, not sent to the backend at all — the intent simply
  expires unused.

## 7. Logging vs. user-facing messages

Every error response is also logged server-side (see
[LOGGING.md](./LOGGING.md)) with full internal detail (stack trace,
request context); the `message` field returned to the client is
deliberately curated to never leak internal detail (file paths, SQL,
contract addresses beyond what's already public) even for `500 INTERNAL_ERROR`,
which always returns a generic "Something went wrong, our team has been
notified" message regardless of the underlying cause.
