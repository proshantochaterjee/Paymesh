# Design System

Implementation vehicle: Tailwind CSS + shadcn/ui, configured via
`configs/tailwind` and consumed by `apps/frontend`. This document defines
the token contract; shadcn component variants are generated from these
tokens, not the other way around.

## 1. Token architecture

All colors are defined as CSS variables in HSL, following shadcn/ui's
semantic-token convention (`--background`, `--foreground`, `--primary`,
`--muted`, `--destructive`, etc.) rather than hardcoded hex values in
components, so the eventual light-theme (post-MVP) is a second variable
block, not a component rewrite.

```css
:root[data-theme="dark"] {
  /* Stripe Dashboard-inspired: deep navy (not flat black), generous
     card/border separation, indigo accent. Revised from the original flat
     near-black palette in the post-MVP visual pass (found by actually
     running the app: the original tokens rendered as extremely flat/sparse
     compared to the "Series B fintech" mandate in UI_UX_GUIDELINES.md). */
  --background: 224 40% 6%;
  --foreground: 210 25% 97%;
  --card: 222 32% 9%;
  --card-foreground: 210 25% 97%;
  --border: 222 22% 17%;
  --muted: 222 26% 13%;
  --muted-foreground: 220 12% 64%;
  --primary: 239 84% 67%;           /* indigo, single restrained accent, used sparingly */
  --primary-foreground: 210 40% 98%;
  --success: 152 60% 45%;
  --warning: 38 92% 55%;
  --destructive: 0 72% 58%;
  --info: 199 89% 55%;
  --ring: 239 84% 67%;
}
```

Placeholder brand hue (`239` indigo) — swap for the org's actual brand hue
before public launch; every other token is derived relative to it so a
rebrand is a one-line change.

## 2. Status color mapping (used only for status, per UI_UX_GUIDELINES §5)

| State | Token | Used for |
|---|---|---|
| Success | `--success` | `COMPLETED`, `RELEASED`, `CONFIRMED` |
| Warning | `--warning` | `PARTIAL`, `PENDING`, `SCHEDULED` |
| Destructive | `--destructive` | `FAILED`, `CANCELLED` |
| Info | `--info` | `SUBMITTED`, `EXECUTING`, `FUNDED` |
| Neutral | `--muted-foreground` | `DRAFT`, `INACTIVE` |

## 3. Chart palette

Categorical and sequential palettes for Recharts follow the `dataviz`
skill's validated methodology (see `references/palette.md` in that skill)
rather than ad hoc chart colors — invoked at implementation time when
analytics charts are actually built, not duplicated here as a static
list that could drift from the validated source.

## 4. Typography tokens

```css
--font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
--text-xs: 0.75rem;   --text-sm: 0.875rem; --text-base: 1rem;
--text-lg: 1.125rem;  --text-xl: 1.25rem;  --text-2xl: 1.5rem;
--text-3xl: 1.875rem;
```

## 5. Radius & elevation

- `--radius: 0.625rem` base (used for cards, inputs, buttons) — deliberately
  modest, not the large pill-shaped radii common in consumer crypto apps.
- Elevation via subtle `border` + minimal `box-shadow` (a soft, low-opacity
  shadow on modals/popovers only) rather than heavy drop shadows —
  consistent with the Linear/Vercel reference aesthetic.

## 6. Component variant conventions (shadcn/ui)

- `Button`: `default` (primary actions), `secondary`, `outline`, `ghost`,
  `destructive` (money-moving irreversible actions only, e.g., "Cancel
  Milestone"). No custom one-off button styles outside these variants.
- `Badge`: maps 1:1 to the status color table in §2 — a `StatusBadge`
  wrapper component takes a domain status enum value and renders the
  correct `Badge` variant, so status-to-color mapping lives in one place.
- `DataTable`: built on TanStack Table + shadcn primitives, shared across
  Employees/Contractors/Payroll/Transactions list pages.

## 7. Iconography

Lucide icons exclusively (shadcn/ui's default), monochrome, sized `16px`
inline / `20px` standalone — no multi-color icon sets, no illustrated
mascots.

## 8. Accessibility baseline

All token pairs (`--foreground` on `--background`, `--primary-foreground`
on `--primary`, etc.) must meet WCAG AA contrast (4.5:1 for text, 3:1 for
large text/UI components) — verified against the concrete HSL values above
before implementation; adjust lightness values if a future palette swap
regresses contrast.
