# Roadmap

## MVP (this repository's scope)

See [PRODUCT_REQUIREMENTS_DOCUMENT.md](./PRODUCT_REQUIREMENTS_DOCUMENT.md)
section 3.1. Delivered per [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md)'s
21-step sequence.

## Post-MVP (not designed, not stubbed, not hinted at in current code)

Listed here only so architecture decisions can be checked against "does
this make the future item impossible" without building anything for them
now.

| Item | Why deferred | Architectural note for later |
|---|---|---|
| Streaming payroll (per-second/continuous disbursement) | Needs a fundamentally different payment primitive (claimable balances or a streaming contract pattern) and changes the Treasury authorization model | `payroll_engine` is a separate singleton contract specifically so a future `streaming_payroll_engine` can be added without touching `treasury` or `employee_registry` |
| Token vesting schedules | Separate domain (cliff/linear release of a token grant, not a wage) | Would be a new `vesting_engine` contract and `VestingGrant` DB entity; no changes needed to existing entities |
| On-chain governance | Requires a governance token/voting contract and proposal lifecycle | Organization role model (`OWNER/ADMIN/FINANCE/HR/VIEWER`) is deliberately simple RBAC, not a voting system, so it doesn't need to be unwound later |
| AI features | Out of scope entirely for MVP; no LLM dependency anywhere in the stack | N/A |
| Accounting integrations (QuickBooks, Xero) | Needs its own auth (OAuth to third party), mapping layer, and sync jobs | `Transaction` and `PayrollRun` schemas are already normalized enough to export; a future `integrations` module would read, not modify, core tables |
| Notifications (email/Slack/push) | Needs delivery infra (queue, templates, provider) not in MVP infra budget | BullMQ is already an optional dependency in the stack for future job queues; notification jobs would slot in without new infra |
| Multi-asset treasury (beyond USDC) | Adds FX/pricing complexity | `Treasury` contract is written against a single configured SAC token address per instance; multi-asset would mean a map of token address -> balance, a schema change that doesn't affect other contracts |

## Sequencing principle

Nothing in the MVP schema, API, or contract set should require a breaking
change to support the items above — only additive changes (new tables, new
contracts, new endpoints). If a future item would require breaking an MVP
contract's storage layout or API shape, that's a signal the MVP design has
leaked an unwarranted assumption, and it should be reconsidered now, not
after mainnet deployment.
