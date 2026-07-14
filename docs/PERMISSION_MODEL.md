# Permission Model

## 1. Roles

`OWNER > ADMIN > FINANCE, HR (incomparable to each other) > VIEWER`

| Role | Can do |
|---|---|
| `OWNER` | Everything `ADMIN` can, plus: cannot be removed if the last owner, transfer ownership |
| `ADMIN` | Manage members/roles (except granting `OWNER`), withdraw from treasury, approve/cancel milestones, update org profile, migrate engine contract pointers |
| `FINANCE` | Deposit, run/execute payroll, create/fund/approve/release/cancel milestones |
| `HR` | Manage employees/contractors (create/update/deactivate, CSV import) — no treasury/payroll/milestone financial actions |
| `VIEWER` | Read-only access to all dashboards, employees, contractors, payroll, milestones, transactions, analytics |

`FINANCE` and `HR` are deliberately incomparable (neither is "above" the
other) — a Finance user cannot edit employee records, and an HR user
cannot move money, reflecting a real separation-of-duties control common
in finance orgs.

## 2. Enforcement layers (defense in depth)

1. **Frontend**: hides/disables affordances the current role can't use
   (UX only, not a security boundary).
2. **API (`OrgRoleGuard`)**: every mutating controller method declares
   `@MinRole(Role.X)`; the guard loads the caller's `OrganizationMember`
   row for the org in the URL (`:orgId` or `:id`, depending on the
   controller — see [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) §3)
   and rejects with `403 FORBIDDEN_ROLE` if insufficient.
3. **Smart contract**: the actual, un-bypassable boundary — every
   fund-moving contract function independently calls back into that org's
   `organization.require_role` (see
   [SMART_CONTRACT_SPECIFICATION.md](./SMART_CONTRACT_SPECIFICATION.md)),
   so even a compromised or buggy backend cannot move funds without a
   correctly-authorized on-chain role holder's signature.

The API layer exists for good UX (fast, clear rejection before wasting a
wallet-signing round trip) — the contract layer exists because it must.
Layer 2 is never treated as sufficient on its own for anything that moves
money.

## 3. Role assignment source of truth

Postgres `OrganizationMember.role` and the on-chain `organization`
contract's `Role(Address)` storage represent the **same fact** and must be
kept in sync: every role grant/revoke API call performs both the DB write
and the on-chain `grant_role`/`revoke_role` call as one logical operation
(DB write happens first as `PENDING`-equivalent, confirmed once the chain
call succeeds — mirroring the two-phase pattern in
[EMPLOYEE_MODEL.md](./EMPLOYEE_MODEL.md)). If they ever diverge (e.g., a
failed chain call after a successful DB write), the **on-chain value is
authoritative** for any actual fund-moving authorization; the DB value
only drives API-layer UX and is reconciled by a periodic consistency job
akin to the treasury reconciliation job in
[TREASURY_ARCHITECTURE.md](./TREASURY_ARCHITECTURE.md) §7.

## 4. Scoping

All roles are **per-organization**, stored per `(organizationId, userId)`
pair. A user can hold `OWNER` in one org and no membership at all in
another. There is no global/platform-level admin role in the MVP beyond
infrastructure operators who have direct database/deploy access (not a
product-level role).

## 5. Special cases

- **Last owner protection**: enforced both at the API layer (reject the
  request) and on-chain (`E_CANNOT_REVOKE_LAST_OWNER`), per
  [SMART_CONTRACT_SPECIFICATION.md](./SMART_CONTRACT_SPECIFICATION.md) §2.
- **Self-demotion**: an Owner/Admin can voluntarily lower their own role
  (except the last-owner case), a deliberate action requiring the same
  confirmation UX as any other role change.
- **Payee roles**: employees/contractors receiving payments are not
  WorkforceOS users/roles at all in MVP — they're just wallet addresses on
  file. A future "employee self-service portal" would introduce a `PAYEE`
  role; explicitly out of MVP scope.
