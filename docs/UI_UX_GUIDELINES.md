# UI/UX Guidelines

## 1. Aesthetic mandate

The product must read as **enterprise banking software**, not a crypto
app. Inspiration: Stripe Dashboard, Linear, Mercury, Brex, Ramp, Vercel.

Explicitly avoid: purple/blue gradient hero sections, glowing/neon
accents, coin/wallet iconography as decoration, "Web3" typographic
flourishes, particle/animated backgrounds, excessive rounded-pill buttons
mimicking token-swap UIs. The user should be able to screenshot any page
and have it plausibly mistaken for a Series B fintech's internal ops tool.

## 2. Theme

Dark theme as the primary, default theme (matches the reference products'
default modes for financial dashboards). A light theme is not required for
MVP but the token system in [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) is
structured to support one later without a redesign.

## 3. Spacing & density

- Base spacing unit: 4px scale (Tailwind default), used consistently — no
  ad hoc pixel values in components.
- Dashboard density favors **information clarity over whitespace
  maximalism**: tables are compact (comfortable, not cramped) by default,
  matching Stripe/Mercury table density rather than a sparse marketing-site
  feel.
- Page max-width: content area caps at `1440px` centered, with a
  persistent left sidebar (org switcher + primary nav) at fixed width
  `240px` (collapsible to icon-only `64px`).

## 4. Typography

- One typeface family, a grotesque/neutral sans (e.g., Inter or a
  self-hosted equivalent) for both UI and numerals — tabular figures
  enabled (`font-variant-numeric: tabular-nums`) for every monetary/number
  column so amounts align vertically in tables.
- Type scale: `xs 12px / sm 14px / base 16px / lg 18px / xl 20px / 2xl
  24px / 3xl 30px`, with body copy defaulting to `sm`/`base` — dashboards
  are data-dense, not editorial.
- Monetary values always render with the currency code (`1,250.00 USDC`),
  never a bare number, and never a `$` for what is actually USDC on
  Testnet — avoid implying real-dollar settlement.

## 5. Color usage

Full palette and validated pairs in [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)
(built per the `dataviz` design-system methodology for chart colors).
Rules that apply everywhere:
- Status colors (success/warning/danger/info) are used **only** for actual
  status meaning (payroll `COMPLETED` vs `FAILED`, milestone status
  badges) — never as decorative accents elsewhere.
- No gradients on interactive elements (buttons, inputs). Gradients are
  permitted only in chart fills where they aid readability (e.g., area
  chart fade-to-transparent), per the dataviz skill's guidance.

## 6. Core interaction patterns

- **Tables**: sticky header, sortable columns where meaningful, row-level
  actions in a trailing overflow menu, never destructive actions as a bare
  icon without confirmation.
- **Money-moving actions** (execute payroll, release milestone, withdraw)
  always show a confirmation step summarizing exactly what will happen
  (amount, recipient(s), from which treasury) before requesting a wallet
  signature — never a single-click irreversible action.
- **Wallet signing states**: a dedicated, consistent modal sequence for
  every signing flow: "Review" -> "Waiting for wallet" -> "Submitting" ->
  "Confirming on-chain" -> "Done", reused via the `useSignAndSubmit` hook
  (see [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) §3) so the
  mental model is identical whether the user is depositing, running
  payroll, or releasing a milestone.
- **Empty states**: icon + one-sentence explanation + primary CTA, never a
  bare "No data."

## 7. Responsive behavior

- **Desktop (≥1280px)**: full sidebar + multi-column dashboards.
- **Tablet (768–1279px)**: collapsible sidebar (icon-only default), tables
  scroll horizontally within their container rather than reflowing into
  illegible stacked cards.
- **Mobile (<768px)**: read-mostly experience — dashboards, transaction
  history, and detail views are fully usable; multi-step wizards (payroll
  execution, CSV import) show a "best viewed on a larger screen" notice
  but remain functionally reachable, per the master spec's "responsive,"
  not "mobile-first," requirement.

## 8. Motion

Minimal, functional motion only: 150–200ms ease-out for
open/close/hover transitions. No decorative animation. Loading skeletons
use a subtle shimmer, not a spinner, wherever the final layout shape is
known ahead of time.
