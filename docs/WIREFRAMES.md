# Wireframes

Low-fidelity ASCII layouts capturing structure, not pixels. Visual
treatment governed by [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) and
[UI_UX_GUIDELINES.md](./UI_UX_GUIDELINES.md).

## Dashboard shell (applies to every `/org/[orgId]/*` page)

```
┌──────────┬──────────────────────────────────────────────────────────┐
│ [Logo]   │  Org: Acme DAO ▾                          [User avatar ▾] │
│          ├──────────────────────────────────────────────────────────┤
│ Dashboard│                                                            │
│ Treasury │                     <page content>                        │
│ Employees│                                                            │
│ Contract.│                                                            │
│ Payroll  │                                                            │
│ Milestone│                                                            │
│ Transact.│                                                            │
│ Analytics│                                                            │
│ Settings │                                                            │
│          │                                                            │
└──────────┴──────────────────────────────────────────────────────────┘
```

## Dashboard home

```
┌───────────────────┬───────────────────┬───────────────────┬─────────┐
│ Treasury Balance    │ Active Headcount   │ MTD Payroll Spend │ Open MS │
│ 42,500.00 USDC      │ 18                 │ 12,300.00 USDC    │ 3       │
├───────────────────┴───────────────────┴───────────────────┴─────────┤
│  Payroll cost trend (chart)              │  Treasury flow (chart)     │
├───────────────────────────────────────────┴────────────────────────┤
│  Recent transactions (last 5, link to full history)                 │
└───────────────────────────────────────────────────────────────────┘
```

## Treasury page

```
┌──────────────────────────────────────────────────────────────────┐
│  Balance: 42,500.00 USDC          [Deposit]  [Withdraw]           │
│  Pending obligations: 8,000.00 USDC (2 scheduled runs, 1 milestone)│
├──────────────────────────────────────────────────────────────────┤
│  Deposit / Withdrawal history table                                │
│  Date | Type | Amount | From/To | Status | Tx                     │
└──────────────────────────────────────────────────────────────────┘
```

## Employees list

```
┌──────────────────────────────────────────────────────────────────┐
│  [Search]  [Department ▾] [Status ▾]      [Import CSV] [Add Employee]│
├──────────────────────────────────────────────────────────────────┤
│  Name | Department | Wallet | Salary | Frequency | Status | •••    │
│  ...rows...                                                        │
└──────────────────────────────────────────────────────────────────┘
```

Empty state (no employees):
```
┌──────────────────────────────────────────────────────────────────┐
│                         [icon]                                    │
│                 No employees yet                                  │
│     Add your first employee or import a CSV to get started.       │
│              [Add Employee]   [Import CSV]                        │
└──────────────────────────────────────────────────────────────────┘
```

## Payroll run detail

```
┌──────────────────────────────────────────────────────────────────┐
│  Run: Jul 1–15, 2026        Status: PARTIAL       [Retry Failed]   │
│  Total: 12,500.00 USDC     Paid: 5,000.00   Failed: 7,500.00       │
├──────────────────────────────────────────────────────────────────┤
│  Employee | Amount | Status | Tx                                   │
│  Jane Doe | 5,000  | PAID   | 0xabc... ↗                            │
│  John Roe | 7,500  | FAILED | employee_inactive                     │
└──────────────────────────────────────────────────────────────────┘
```

## Milestone detail (state machine visible)

```
┌──────────────────────────────────────────────────────────────────┐
│  "Landing page redesign" — Contractor: Jane Freelance               │
│  Amount: 2,000.00 USDC                                              │
│                                                                      │
│  [Draft] ──funded──▶ [●Funded] ──approve──▶ [Approved] ──▶ [Released]│
│                                                                      │
│  Current: FUNDED                       [Approve]  [Cancel]          │
└──────────────────────────────────────────────────────────────────┘
```

## Wallet signing modal sequence (reused everywhere, see UI_UX_GUIDELINES §6)

```
Step 1: Review           Step 2: Waiting        Step 3: Confirming
┌───────────────────┐    ┌───────────────────┐  ┌───────────────────┐
│ Release 2,000 USDC │    │  Check your wallet │  │  Confirming on-    │
│ to Jane Freelance   │    │  extension...       │  │  chain... (2/3)    │
│ from Treasury        │    │  [spinner]          │  │  [progress]         │
│ [Cancel] [Confirm]   │    │                     │  │                     │
└───────────────────┘    └───────────────────┘  └───────────────────┘
```

## CSV import wizard

```
Step 1: Upload          Step 2: Review          Step 3: Confirm
┌─────────────────┐     ┌─────────────────┐    ┌─────────────────┐
│ Drop CSV here     │     │ 45 valid rows      │    │ Registering 45     │
│ or [Browse]         │     │ 3 rows with errors  │    │ employees on-chain │
│                     │     │ [row-level detail]  │    │ [progress: 12/45]  │
└─────────────────┘     └─────────────────┘    └─────────────────┘
```
