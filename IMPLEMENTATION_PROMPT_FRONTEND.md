# WorkforceOS — Frontend Implementation Session Prompt

Paste this into a **new session**, in this same repository
(`/Users/samya/Downloads/paymesh`), to build `apps/frontend` from scratch.
This is Step 15 of the 21-step build sequence in
`docs/DEVELOPMENT_PLAN.md` — every step before it (contracts, backend,
database, auth, wallet primitives, treasury, employees, payroll,
milestones, event indexer, remaining APIs) is already implemented. You are
not designing a new product; you are the frontend for an API and domain
model that already exist and are not up for renegotiation.

---

You are acting as a **Senior Product Designer and Senior Frontend
Engineer** building the entire client application for **WorkforceOS**, a
programmable workforce-finance platform (payroll, contractor milestones,
treasury) settled on Stellar Testnet via Soroban smart contracts.

## 0. Read before writing any code

Read, in this order, in full:

1. `docs/PRODUCT_REQUIREMENTS_DOCUMENT.md` — problem, personas, MVP scope,
   explicit non-scope.
2. `docs/FRONTEND_ARCHITECTURE.md` — routing, server/client component
   split, data fetching, wallet integration, component structure.
3. `docs/DESIGN_SYSTEM.md` and `docs/UI_UX_GUIDELINES.md` — the token
   contract and the aesthetic mandate. These are not suggestions; the
   product must be visually indistinguishable from a Series B fintech
   ops tool (Stripe Dashboard / Linear / Mercury / Brex / Ramp / Vercel),
   not a "crypto app."
4. `docs/STATE_MANAGEMENT.md` — the exact ownership split between
   TanStack Query, Zustand, React Hook Form, and URL state. No exceptions
   to "no state category duplicated across two owners."
5. `docs/USER_FLOWS.md` and `docs/WIREFRAMES.md` — narrative flows and
   low-fidelity layout per screen.
6. `docs/API_SPECIFICATION.md` in full — every endpoint you will call,
   every error code you must handle, and critically the **intent/submit
   pattern** (§"Every 'intent' endpoint follows the same shape") that
   underlies every money-moving action.
7. `docs/PERMISSION_MODEL.md` — the five roles
   (`OWNER > ADMIN > FINANCE, HR > VIEWER`) and which actions each can
   see/do. Frontend enforcement here is UX only (hide/disable), never a
   security boundary — the API and contract layers are the real gate.
8. `docs/AUTHENTICATION.md` — the two login methods (email/password,
   Stellar wallet challenge/response) that produce one session shape, and
   §3's wallet-linking flow.
9. `docs/CSV_IMPORT.md`, `docs/EMPLOYEE_MODEL.md` (two-phase
   creation), `docs/PAYROLL_ENGINE.md` (chunked execution,
   partial-failure semantics), `docs/MILESTONE_ENGINE.md` (state
   machine) — read each right before building that specific feature, not
   all up front.
10. `packages/shared/src/schemas/*.ts` and
    `packages/shared/src/constants/enums.ts` — these are the actual Zod
    schemas and enum unions you import into forms and types. Do not
    redefine them client-side.
11. `packages/sdk/src/stellar/freighter.ts` — the existing Freighter
    wallet adapter (`isFreighterAvailable`, `connectFreighter`,
    `signMessageWithFreighter`, `signTransactionWithFreighter`). Build on
    top of this; do not re-implement wallet signing from scratch.

Then inspect the real repo state (`git status`, `git log`, `ls
apps/backend/src/modules`) before writing anything. `apps/frontend` does
not exist yet — confirm that's still true, and confirm which backend
modules/endpoints are actually implemented versus only documented (e.g.
check `apps/backend/src/modules/organizations`,
`apps/backend/src/modules/analytics`, `apps/backend/src/modules/indexer`
for real controllers/routes) before assuming every endpoint in
`API_SPECIFICATION.md` is live. If something documented isn't actually
implemented yet, stop and reconcile with me rather than building against
an endpoint that doesn't exist.

## 1. Non-negotiable product/design rules

- **Enterprise banking software, not a crypto app.** No purple/blue
  gradient hero sections, no glowing/neon accents, no coin/wallet
  iconography as decoration, no "Web3" typographic flourishes, no
  particle/animated backgrounds, no pill-shaped token-swap-style buttons.
  Every screen should be screenshot-able and plausibly mistaken for an
  internal ops tool at a Series B fintech.
- **Dark theme is the default and only theme for MVP** (token system must
  still be structured to add light mode later without a redesign — see
  `DESIGN_SYSTEM.md` §1).
- **Money-moving actions never happen on a single click.** Every one
  (deposit, withdraw, execute payroll, fund/approve/release/cancel
  milestone) shows a confirmation step with exact amount/recipient/source
  before requesting a wallet signature, then walks through the same
  five-stage modal sequence every time: **Review → Waiting for wallet →
  Submitting → Confirming on-chain → Done.** Build this once as the
  `useSignAndSubmit` hook (see §5 below); every feature reuses it. Do not
  build a bespoke signing flow per feature.
- **Backend never holds a signing key.** Every fund-moving mutation is:
  frontend calls a `-intent` endpoint → gets `{ intentId, unsignedXdr,
  expiresAt }` → wallet signs the XDR client-side → frontend POSTs
  `{ signedXdr }` to the matching `/submit` endpoint. Never invent a
  shortcut that skips this.
- **Monetary values always render with the currency code** (`1,250.00
  USDC`), tabular figures (`font-variant-numeric: tabular-nums`) in every
  numeric table column, never a bare number, never a `$` prefix.
- **Every data page implements four states explicitly**: loading
  (skeleton matching final layout — never a spinner-only blank screen),
  error (inline retry, not a full-page crash unless truly fatal), empty
  (icon + one-sentence explanation + primary CTA — never a bare "No
  data"), and responsive down to tablet width (≥768px full functionality;
  <768px read-mostly, with multi-step wizards showing a "best viewed
  wider" notice but staying reachable).
- **WCAG 2.1 AA** for all primary flows: keyboard-navigable interactive
  elements, correct ARIA roles (shadcn/ui's Radix primitives give you
  these by default — don't fight them), verified color contrast, and
  `aria-live="polite"` regions announcing loading/error transitions on
  every data-fetching page.
- **No placeholder/mock data left in the shipped app.** Every page is
  wired to the real backend API by the time Step 15 is declared done.

## 2. Tech stack (locked — do not re-litigate)

Next.js 15 (App Router) + TypeScript, TailwindCSS + shadcn/ui (configured
from `configs/tailwind`), TanStack Query (server state) + TanStack Table
(data tables), Zustand (client-only UI state), React Hook Form + Zod
resolvers (forms, schemas from `packages/shared`), Recharts (charts, per
the `dataviz` skill's methodology for palette/marks), Lucide icons only.
`packages/sdk`'s browser-safe subset for wallet signing/XDR handling —
`apps/frontend` never talks to Stellar RPC/Horizon directly for reads; all
data reads go through the backend API.

## 3. Routing (exact tree, from `FRONTEND_ARCHITECTURE.md` §1)

```
/                              redirect to /login or /org/[lastOrgId]/dashboard
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

`org/[orgId]/layout.tsx` verifies server-side that the caller is a member
of `orgId` before rendering any child route (redirect to a 403 page
otherwise) — no client component ever re-checks org membership
defensively. There is no implicit "current org" outside the URL.

## 4. Component architecture

- `components/` — generic, feature-agnostic (shadcn/ui primitives:
  Button, Card, Table, Dialog, etc., plus compositions: `StatTile`,
  `EmptyState`, `DataTable`, `StatusBadge`).
- `features/<domain>/` — one folder per backend module
  (`features/payroll/PayrollRunWizard.tsx`,
  `features/treasury/DepositDialog.tsx`, etc.) for 1:1 navigability with
  the backend's own module structure.
- `lib/api/server.ts` — server-only fetch wrapper forwarding the session
  cookie, used by Server Components for first paint.
- `lib/api/client.ts` — client-side fetch wrapper used by TanStack Query
  hooks.
- `lib/wallet/` — adapter interface (`connect()`, `getAddress()`,
  `signTransaction(xdr)`) wrapping `packages/sdk`'s Freighter helpers, so
  a second wallet can be added later without touching call sites.
- Server Components by default (dashboard shells, tables, analytics
  pages); Client Components (`'use client'`) marked at the leaf level
  only (forms, the wallet flow, modals, wizards) — keep server-rendered
  shells as large as possible.

## 5. The `useSignAndSubmit` hook — build this first, before any feature page

One hook, reused by treasury deposit/withdraw, employee register/
update/deactivate, payroll execute, and every milestone action. It:

1. Accepts a `buildIntent()` call (hits the `-intent` endpoint) and a
   `submitIntent(intentId, signedXdr)` call (hits the `/submit`
   endpoint) as parameters — feature code supplies which endpoints, the
   hook supplies the flow.
2. Drives the UI through exactly: **Review** (caller-supplied summary
   content: amount, recipient, source) → user confirms → **Waiting for
   wallet** (calls `signTransactionWithFreighter`) → **Submitting**
   (POSTs signed XDR) → **Confirming on-chain** (short-polls, 2s
   interval, the relevant entity/`Transaction` status until it reaches a
   terminal state — `CONFIRMED`/`FAILED`/etc.) → **Done**.
3. Handles rejection at every stage (user rejects the wallet prompt,
   `410 INTENT_EXPIRED`, `409 INTENT_ALREADY_SUBMITTED`, `502
   SIMULATION_FAILED`, `502 CHAIN_SUBMISSION_FAILED`) with a clear,
   specific inline message per error code — never a generic "Something
   went wrong."
4. On success, invalidates the narrowest matching TanStack Query key set
   (per `STATE_MANAGEMENT.md` §2) — never a blanket invalidate-everything.
5. For multi-chunk flows (payroll execution, CSV bulk registration,
   milestone's create-then-fund two-step), the hook or its caller loops:
   call `execute-intent` → sign → submit → check `isLastChunk`/`step` →
   repeat until done, showing "Processing batch 2 of 3..." progress.

## 6. Page-by-page requirements

For every page below: role-gate actions per `PERMISSION_MODEL.md`
(disable/hide, don't just rely on the API's 403), implement all four
required states (§1), and use the real endpoint(s) listed.

### `/login`, `/register`
Email/password forms (Zod schemas from `packages/shared/src/schemas/auth.ts`)
plus a "Sign in with wallet" option that runs
challenge → `signMessageWithFreighter` → verify
(`/auth/wallet/challenge`, `/auth/wallet/verify`). No org context yet.

### `/org/[orgId]/dashboard`
Stat tiles: treasury balance, active headcount, MTD payroll spend, open
milestone count/value (`GET /organizations/:id/analytics/overview` +
milestone list). Two charts: payroll cost trend, treasury inflow/outflow
(`.../analytics/payroll-trends`, `.../analytics/treasury-flow`). Recent
transactions (last 5, link to full history). Empty-state variant for a
brand-new org (no employees/payroll history yet) with CTAs to add an
employee / make a deposit.

### `/org/[orgId]/treasury`
Live balance + pending-obligations summary (`GET .../treasury`), Deposit
and Withdraw buttons (FINANCE min-role for deposit, ADMIN for withdraw)
opening the intent/sign/submit flow via `useSignAndSubmit`, and a
paginated deposit/withdrawal history table
(`GET .../transactions`, filtered client-side to `DEPOSIT`/`WITHDRAWAL`
or via the shared Transactions page — your call, but don't duplicate the
table component).

### `/org/[orgId]/employees` (list) + `/org/[orgId]/employees/[employeeId]` (detail)
List: search, department filter, status filter (all as URL search
params, not component state), Import CSV button, Add Employee button.
`DataTable` columns: name, department, wallet (truncated with copy
affordance), salary, frequency, status, row actions menu. Add Employee
opens a form (schema from `employee.ts`) — submit creates the Postgres
row AND kicks off the register-intent sign flow in one continuous UX
(per `USER_FLOWS.md` §3); show a distinct "Registration pending — retry"
badge/state for an employee whose on-chain call failed, never let it
silently vanish. Detail page: full profile, edit (salary/frequency/
department — only salary/frequency changes trigger an update-intent sign
flow if already registered on-chain), deactivate (soft-delete,
conditionally followed by a deactivate-intent sign flow).

### CSV Import wizard (`features/employees/CsvImportWizard.tsx`)
Three steps in one RHF instance: Upload → dry-run review (valid-row
count, per-row errors inline: bad wallet address, missing field,
duplicate email) → Confirm (register each successfully-created row
on-chain via its own register-intent, sequential/batched signing
progress "Registering 12/45"). See `docs/CSV_IMPORT.md` for the exact
dry-run/commit contract.

### `/org/[orgId]/contractors` (list) + `/org/[orgId]/contractors/[contractorId]` (detail)
Postgres-only CRUD, no on-chain registration, no intent flow — simpler
than Employees. Status filter, deactivate action.

### `/org/[orgId]/payroll` (list) + `/org/[orgId]/payroll/[runId]` (detail)
List: runs with status badges. New Run wizard: select pay period +
employee set (default "all active" is a frontend convenience — send
explicit `employeeIds` to the API), preview shows total cost,
per-department breakdown, and current treasury balance side by side,
flags insufficient balance before the user can proceed. Schedule vs.
Execute Now. Execute drives `useSignAndSubmit` in a loop over
`execute-intent`'s chunks, showing "Processing batch X of Y," and must
handle `422 INSUFFICIENT_TREASURY_BALANCE` (shows the `shortfall`
amount) proactively. Detail page: per-employee item table (amount,
status, `stellarTxHash` linking to Stellar Expert Testnet), a
"Retry Failed" affordance for `FAILED` items that deep-links to
creating a follow-up run.

### `/org/[orgId]/milestones` (list) + `/org/[orgId]/milestones/[milestoneId]` (detail)
List: status filter. New Milestone form: contractor select, title,
description, amount (Postgres-only DRAFT creation, no chain call).
Detail page renders the state machine visibly (`DRAFT → FUNDED →
APPROVED → RELEASED`, with `CANCELLED` reachable from `DRAFT`/`FUNDED`)
per the `WIREFRAMES.md` layout — current state highlighted, available
next actions as buttons (Fund/Approve/Release/Cancel), each driving
`useSignAndSubmit`. Fund is a two-step on-chain flow
(`create_milestone` then `fund_milestone`) fronted by one endpoint that
returns which `step` is next — the UI must handle both steps
transparently as "funding in progress," not surface the two-call detail
to the user unless useful for debugging.

### `/org/[orgId]/transactions`
Full paginated history, filterable by type/status/date range (URL state),
each row linking out to Stellar Expert (Testnet) via `stellarTxHash`, and
rows tied to a `PayrollRun`/`Milestone` deep-linking to that entity's
detail page via `relatedEntityType`/`relatedEntityId`.

### `/org/[orgId]/analytics`
Overview cards (reuse dashboard's, or a superset) plus all four chart
types from `USER_FLOWS.md` §8: payroll cost trend, treasury inflow/
outflow, spend by department, milestone completion rate. Follow the
`dataviz` skill for chart color/mark choices — invoke it when you get to
this page, don't hardcode chart colors ad hoc.

### `/org/[orgId]/settings`
Org profile (name edit, ADMIN min-role, Postgres-only PATCH — no chain
call). Members tab: list + roles, Invite (email + role select, ADMIN
min-role, drives the add-intent sign flow for `organization.grant_role`),
role change and remove member (same intent pattern, both driving
`useSignAndSubmit`), with the "last owner" case
(`422 INVALID_STATE_TRANSITION`) surfaced as a disabled action with an
explanatory tooltip rather than a raw error after the fact. Security tab:
"Connect wallet" (links a wallet via `/auth/wallet/link` using the same
challenge/response flow as login, without creating a new session).

### Org creation / onboarding (no org yet)
First-run flow per `USER_FLOWS.md` §1: create org (name only) →
`create-intent`/`submit` sign flow deploys `organization` + `treasury`
contracts → org appears with zero balance → optional (skippable) prompt
to connect a treasury wallet and make an initial deposit → redirect to
the new org's dashboard with empty states everywhere.

## 7. Design tokens — use these exact values, don't invent your own

From `docs/DESIGN_SYSTEM.md` — implement as CSS variables in HSL under
`:root[data-theme="dark"]`:

```css
--background: 222 20% 9%;
--foreground: 210 20% 96%;
--card: 222 18% 12%;
--card-foreground: 210 20% 96%;
--border: 222 14% 20%;
--muted: 222 14% 16%;
--muted-foreground: 215 12% 65%;
--primary: 217 91% 60%;
--primary-foreground: 210 40% 98%;
--success: 142 71% 45%;
--warning: 38 92% 55%;
--destructive: 0 72% 55%;
--info: 199 89% 55%;
--ring: 217 91% 60%;
--radius: 0.5rem;
```

Status → color mapping (used **only** for status, never decoratively
elsewhere): success = `COMPLETED`/`RELEASED`/`CONFIRMED`; warning =
`PARTIAL`/`PENDING`/`SCHEDULED`; destructive = `FAILED`/`CANCELLED`; info
= `SUBMITTED`/`EXECUTING`/`FUNDED`; neutral (`--muted-foreground`) =
`DRAFT`/`INACTIVE`. Build one `StatusBadge` component that maps a domain
enum value to the correct variant — this mapping must not be
reimplemented per feature.

Typography: Inter (or self-hosted equivalent), scale `xs 12 / sm 14 /
base 16 / lg 18 / xl 20 / 2xl 24 / 3xl 30`, tabular figures on every
numeric column. Layout: max content width `1440px` centered, left
sidebar `240px` (collapsible to `64px` icon-only). Buttons: `default`
(primary), `secondary`, `outline`, `ghost`, `destructive` (irreversible
money-moving actions only, e.g. "Cancel Milestone") — no one-off button
styles.

## 8. State management — exact ownership, no exceptions

| State | Owner |
|---|---|
| Server/remote data (employee list, treasury balance, run detail) | TanStack Query |
| Transient client UI (active modal, wizard step, sidebar collapsed) | Zustand (`useUiStore`) |
| Form input | React Hook Form, `mode: 'onBlur'`, Zod resolvers from `packages/shared` |
| List filters/pagination/active tab | URL search params |
| Wallet connection (address, connected/not) | Zustand (`useWalletStore`), persisted to `localStorage` as "last known address" only — never anything sensitive |
| Auth session/current org role | Server-set cookie + thin client hook reading it |

Query keys: `['org', orgId, resource, ...paramsAsPlainObject]`. `staleTime`
30s for fast-changing resources (treasury balance, transactions), 5min
for slow-changing (org profile, members). Confirmation polling: 2s
`refetchInterval` on the specific entity until terminal status, then
stop — implemented once inside `useSignAndSubmit`.

## 9. What "done" looks like for Step 15

Run this checklist out loud before declaring the step finished, per
`DEVELOPMENT_PLAN.md`'s per-milestone template:

- [ ] Every route in §3 exists and renders against the real backend (no
      mock data, no hardcoded fixtures left in page code).
- [ ] `useSignAndSubmit` exists once, is reused by every money-moving
      feature, and its five-stage modal sequence is identical everywhere.
- [ ] Every list/detail page implements loading/error/empty/responsive
      states per §1.
- [ ] Role-based UI gating matches `PERMISSION_MODEL.md` exactly for all
      five roles, verified by logging in as each.
- [ ] Design matches `DESIGN_SYSTEM.md`'s tokens and
      `UI_UX_GUIDELINES.md`'s aesthetic mandate — no gradients/neon/pill
      buttons, dark theme only, tabular numerals on money columns.
- [ ] Forms use schemas imported from `packages/shared`, not
      redefined locally.
- [ ] WCAG AA: keyboard nav works end-to-end on every primary flow;
      contrast verified against the token values in §7.
- [ ] Unit tests (component logic, hooks) and at minimum a smoke-level
      integration pass per `docs/TESTING_STRATEGY.md`'s frontend matrix;
      full Playwright e2e is Step 17, not required to complete here, but
      don't leave the app in a state that can't be exercised manually.
- [ ] `docs/FRONTEND_ARCHITECTURE.md` (and any other doc touched) still
      accurately describes what was built — update it first if a real
      deviation was necessary, never silently drift from it.
- [ ] Any shortcut taken is fixed now or logged in
      `docs/DEVELOPMENT_PLAN.md`'s "Technical debt log" with why and a
      planned resolution.

## 10. Working process

Mirror how prior steps were run: use `TaskCreate`/`TaskUpdate` to track
sub-tasks (shell + tokens → auth pages → dashboard shell/nav →
`useSignAndSubmit` → one feature module at a time in the order
Treasury → Employees → Contractors → Payroll → Milestones →
Transactions → Analytics → Settings → org onboarding) so progress
survives context compaction. If something in `/docs` doesn't answer a
question you're facing (e.g. an exact response shape you need isn't
pinned down), stop and ask rather than inventing an answer — this
project's rule throughout has been "docs change before code, never
after."

Stop and report progress at natural checkpoints (after the shell/auth,
after each feature module) rather than only at the very end, in the same
shape prior steps used: what changed, the checklist above (partially
filled in as it becomes true), what's next, and any risk/debt introduced.
