# State Management

Expands on [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) §3–4
with concrete conventions.

## 1. Categories of state and their owner

| State category | Owner | Example |
|---|---|---|
| Server/remote data | TanStack Query | Employee list, treasury balance, payroll run detail |
| Transient client UI | Zustand | Active modal, sidebar collapsed, wizard step |
| Form input | React Hook Form | Any form field, validated via Zod |
| Navigable/shareable view state | URL (searchParams) | List filters, pagination, active tab |
| Wallet connection | Zustand (`useWalletStore`) | Connected address, connection status |
| Auth session | Server-set cookie + a thin client hook reading it | Current user, current org membership/role |

No state category is ever duplicated across two owners (e.g., filters are
never simultaneously in a `useState` and the URL) — this is the rule that
prevents the classic "back button doesn't restore my filters" and
"refresh loses my place" bugs.

## 2. TanStack Query conventions

- Query key shape: `['org', orgId, resource, ...paramsAsPlainObject]`,
  e.g., `['org', 'org_123', 'payroll-runs', { status: 'PARTIAL', page: 1 }]`.
- `staleTime` defaults: 30s for frequently-changing resources (treasury
  balance, transactions), 5min for slow-changing resources (org profile,
  member list).
- Mutations always use `onSuccess` to `invalidateQueries` on the
  *narrowest* matching key set (e.g., executing a payroll run invalidates
  `['org', orgId, 'payroll-runs']` and `['org', orgId, 'treasury']`, not a
  blanket invalidate-everything).
- Long-running confirmations (waiting for on-chain confirmation) use a
  `refetchInterval` short-poll (2s) on the specific entity until it reaches
  a terminal status, then stop — implemented once inside
  `useSignAndSubmit` and reused everywhere.

## 3. Zustand conventions

- One store per concern (`useUiStore`, `useWalletStore`), never a single
  global "app store" — keeps re-render scope narrow.
- Stores hold **only** client-only state; if a value could be derived from
  a TanStack Query cache or the URL, it does not also live in Zustand.
- Persisted slices (`localStorage`) are limited to non-sensitive UX
  preferences: sidebar collapsed state, last-viewed org ID for the root
  redirect.

## 4. Form conventions

- Every form's Zod schema is imported from `packages/shared/src/schemas`,
  the same schema the backend uses for DTO validation — one definition of
  "what a valid Employee looks like."
- React Hook Form's `mode: 'onBlur'` for validation timing (avoid
  validating every keystroke on financial-amount fields, which reads as
  noisy/aggressive).
- Multi-step forms (CSV import wizard, payroll run creation) keep
  cross-step state in a single RHF instance (via `useForm` at the wizard
  root, steps as controlled sub-views), not separate state per step.

## 5. Why not Redux/Recoil/Jotai

Rejected: the server-state/client-state split TanStack Query + Zustand
already provides covers 100% of this app's needs with less boilerplate
than Redux and a smaller mental model than Jotai's atom graph for a team
that isn't already fluent in it. Revisit only if a future feature needs
genuinely complex derived client-state graphs, which nothing in the MVP
feature set requires.
