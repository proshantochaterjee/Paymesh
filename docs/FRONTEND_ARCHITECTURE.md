# Frontend Architecture

Next.js 15, App Router, TypeScript. App lives at `apps/frontend`.

## 1. Routing

```
/                              marketing/redirect to /login or /org/[lastOrgId]/dashboard
/login, /register              auth pages, outside org context
/org/[orgId]/dashboard
/org/[orgId]/treasury
/org/[orgId]/employees
/org/[orgId]/employees/[employeeId]
/org/[orgId]/contractors
/org/[orgId]/contractors/[contractorId]
/org/[orgId]/payroll
/org/[orgId]/payroll/[runId]
/org/[orgId]/milestones
/org/[orgId]/milestones/[milestoneId]
/org/[orgId]/transactions
/org/[orgId]/analytics
/org/[orgId]/settings
```

Every data page lives under `/org/[orgId]/...` — there is no implicit
"current organization" outside the URL, per
[TREASURY_ARCHITECTURE.md](./TREASURY_ARCHITECTURE.md) §6's isolation
rationale. A layout at `org/[orgId]/layout.tsx` verifies the caller is a
member of `orgId` server-side before rendering any child route (redirects
to a 403 page otherwise), so no client component ever needs to defensively
re-check org membership.

## 2. Server vs. Client Components

- **Server Components** (default): dashboard shells, tables, analytics
  pages — fetch initial data server-side via the backend API (using a
  server-only fetch wrapper in `lib/api/server.ts` that forwards the
  session cookie), eliminating loading spinners for first paint.
- **Client Components**: anything interactive — forms, the wallet
  connect/sign flow, modals, the payroll execution wizard. Marked
  `'use client'` explicitly at the leaf level, not at page level, to keep
  server-rendered shells as large as possible.

## 3. Data fetching & caching

- TanStack Query owns all **subsequent** client-side fetching/mutation
  after first paint (server components handle first paint). Query keys are
  namespaced `['org', orgId, 'employees', filters]` etc., so invalidating
  `['org', orgId, 'treasury']` after a deposit doesn't affect unrelated
  caches.
- Mutations that trigger the intent/submit chain (see
  [API_SPECIFICATION.md](./API_SPECIFICATION.md)) are modeled as a single
  `useSignAndSubmit()` hook wrapping: build intent -> request wallet
  signature -> submit -> poll `Transaction`/entity status until
  `CONFIRMED`/terminal -> invalidate relevant queries. This hook is the
  one place wallet-signing UX (loading states, rejection handling) is
  implemented, reused by payroll execution, milestone actions, and
  treasury deposit/withdraw.

## 4. State management split (detail in STATE_MANAGEMENT.md)

- Server state: TanStack Query.
- Client-only UI state: Zustand (`useUiStore`: active modal, wizard step,
  sidebar collapsed).
- Form state: React Hook Form + Zod resolvers, schemas imported from
  `packages/shared` — the exact same schema the backend validates against.
- URL state: filters/pagination on list pages live in the URL query string
  (via `useSearchParams`/`useRouter`), not component state, so a filtered
  view is shareable/bookmarkable and survives refresh.

## 5. Wallet integration

`lib/wallet/` wraps Freighter's browser API behind a small adapter
interface (`connect()`, `getAddress()`, `signTransaction(xdr)`), so a
second wallet (e.g., xBull, Albedo) can be added later by implementing the
same adapter interface without touching call sites. Connection state
(`connected address` or `null`) lives in a Zustand store, persisted to
`localStorage` only as "last known address" for reconnect convenience —
never anything sensitive.

## 6. Component structure

- `components/` — generic, feature-agnostic UI (shadcn/ui primitives:
  Button, Card, Table, Dialog, etc., plus small compositions like
  `StatTile`, `EmptyState`, `DataTable`).
- `features/<domain>/` — feature-specific components/hooks
  (`features/payroll/PayrollRunWizard.tsx`,
  `features/treasury/DepositDialog.tsx`), one folder per backend module for
  1:1 navigability across the stack.

## 7. Every page's required states

Per the master spec's requirement, every page explicitly implements:
**loading** (skeleton matching final layout, not a spinner-only blank
screen), **error** (inline retry affordance, not a full-page crash unless
truly fatal), **empty** (a real empty state with a call-to-action, e.g.,
"No employees yet — Add your first employee" rather than a bare table
header), and **responsive** behavior down to tablet width (see
[UI_UX_GUIDELINES.md](./UI_UX_GUIDELINES.md) for breakpoints).

## 8. Accessibility

All interactive elements keyboard-navigable, shadcn/ui's Radix primitives
provide correct ARIA roles by default, color contrast verified against
[DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)'s palette at AA minimum, and every
data-fetching page announces loading/error transitions via
`aria-live="polite"` regions.

## 9. Environment/config

`apps/frontend` never talks to Stellar RPC/Horizon directly for reads —
`packages/sdk`'s browser-safe subset is used only for wallet signing and
XDR handling; all data reads go through the backend API so RBAC and
tenant isolation are enforced in one place.
