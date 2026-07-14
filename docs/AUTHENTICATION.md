# Authentication

## 1. Two login methods, one session shape

- **Email/password** via Better Auth's built-in credential provider.
- **Stellar wallet** via a custom challenge/response provider (SEP-10-
  inspired, simplified for application-level auth rather than full SEP-10
  federated auth).

Both produce the same session object (`{ userId, expiresAt, token }`) and
the same JWT claims shape, so every downstream authorization check
(`AuthGuard`, `OrgRoleGuard`) is agnostic to how the user logged in.

## 2. Wallet challenge/response flow

1. `POST /auth/wallet/challenge` with `{ address }` → backend generates a
   random nonce, stores it server-side keyed by address with a 5-minute
   TTL, returns `{ nonce, expiresAt }`.
2. Frontend asks the wallet to sign a fixed-format message:
   `WorkforceOS auth challenge: ${nonce}` (never a raw transaction — this
   is a `signMessage`-style signature, not a Stellar transaction, so it
   cannot be replayed as a real payment).
3. `POST /auth/wallet/verify` with `{ address, signedNonce }` → backend
   verifies the signature against the claimed Stellar account's signing
   key(s) (using the Stellar SDK's signature verification against the
   account's public key, fetched from Horizon), checks nonce hasn't
   expired/been used, then:
   - If a `User` with `primaryWallet = address` exists, logs them in.
   - Else creates a new `User` with that wallet as `primaryWallet`.
4. Nonce is deleted/marked used immediately on successful verification —
   single use only.

## 3. Linking a wallet to an existing email/password account

Settings → Security → "Connect wallet" runs the same challenge/response
flow but calls `POST /auth/wallet/link` (session-authenticated) instead of
`verify`, associating the address with the already-logged-in `User`
instead of creating a new one. Required before that wallet can be used as
a Finance/Admin signer for treasury operations, since the backend must
know which `User`/role a given signing address maps to for audit logging
(the on-chain authorization check is independent and doesn't need this
link — this link is purely for attributing an `AuditLog` entry to a named
user).

The first wallet a `User` ever links also becomes their `primaryWallet`
(only if it's still `NULL` — an email/password user has none until their
first link). This is what any endpoint that infers "act as the caller's
own wallet" reads (e.g. Employees' create/update/deactivate, Step 10 —
`caller` sent on-chain is always `session.user.primaryWallet`, never an
address the client supplies in the body, since a mismatch there would
just fail on-chain `require_auth()` anyway). Linking a *second* wallet
does not change `primaryWallet`; there's no endpoint yet to change which
linked wallet is primary — logged as open scope for whichever step first
needs multi-wallet users to switch their primary.

## 4. Session & token handling

- Session token delivered as an `httpOnly`, `Secure`, `SameSite=Lax`
  cookie for browser clients (CSRF-resistant by construction — no
  JavaScript-readable token to steal via XSS for the primary web flow).
- A bearer-token mode is also supported (`Authorization: Bearer <jwt>`)
  for future non-browser clients (CLI/scripts), issued via `/auth/refresh`
  and short-lived (15 min access token / 7 day refresh token).
- Logout invalidates the session server-side (Better Auth session store in
  Postgres), not just client-side cookie clearing.

## 5. Password requirements

Minimum 12 characters, checked against a common-password denylist
(zxcvbn score ≥ 3), hashed with argon2id (Better Auth default) — never
bcrypt/sha256-only.

## 6. What authentication does NOT do

Authentication proves "who is this person." It does not by itself
authorize any action — that is entirely the job of
[PERMISSION_MODEL.md](./PERMISSION_MODEL.md)'s `OrganizationMember.role`
check, re-verified per request. A valid session with no org membership can
log in but sees no organizations and cannot call any org-scoped endpoint.

## 7. Relationship to on-chain authorization

Logging in (proving control of a wallet via `signMessage`) is a
**separate act** from authorizing a fund-moving transaction (signing an
actual Soroban transaction XDR). A user can be "logged in" as a Viewer and
never be asked to sign anything financial; conversely, the backend never
treats "is logged in with wallet X" as sufficient to execute a payment —
every money-moving action requires a fresh transaction signature at the
time of that specific action, per
[BLOCKCHAIN_ARCHITECTURE.md](./BLOCKCHAIN_ARCHITECTURE.md) §5.
