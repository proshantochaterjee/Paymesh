# SCF Demo Script

A reviewer-ready walkthrough proving the full stack works end to end on
Stellar Testnet, per [PRODUCT_REQUIREMENTS_DOCUMENT.md](./PRODUCT_REQUIREMENTS_DOCUMENT.md)
§6's success criteria. Run against either a locally running stack
(`docker compose up`) or the deployed staging environment.

## 0. Setup (before recording/presenting)

- A Testnet account funded via Friendbot, holding some Testnet USDC
  (either from the project's self-issued `TUSDC` faucet script or an
  existing Testnet USDC source — see
  [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) §3).
- Freighter installed and pointed at Testnet.
- Seed data optionally loaded (`scripts/seed-db.ts`) for a populated
  dashboard, or start from a genuinely empty org to show the onboarding
  empty-state flow.

## 1. Script

1. **Register & connect wallet** — show both login paths: create an
   account with email/password, then connect a Testnet wallet (Freighter)
   from Settings. Narrate: "no private key ever touches our servers."
2. **Create an organization** — name it, watch the on-chain deployment
   happen (show the Stellar Expert Testnet link for the `org_created`
   transaction as it confirms).
3. **Fund the treasury** — deposit Testnet USDC, show the balance update
   live, click through to the transaction on Stellar Expert.
4. **Add employees** — one manually (show the two-phase
   registration-pending -> confirmed state transition), then a batch via
   CSV import (show the dry-run validation catching a deliberately bad row
   in the demo file, then a successful commit).
5. **Run payroll** — create a run, show the cost preview against the
   funded treasury balance, execute, and watch each `PayrollItem` flip to
   `PAID` with a live Stellar Expert link per item.
6. **Contractor milestone** — add a contractor, create a milestone, fund
   it (show it appear as escrowed in the Treasury Dashboard's pending
   obligations), approve, release, and show the contractor's wallet
   balance increase on Stellar Expert.
7. **Transaction history** — show the full, filterable on-chain history
   assembled purely from indexed events, every row deep-linking to
   Stellar's public ledger.
8. **Analytics** — show payroll cost trend, department spend, and
   treasury inflow/outflow charts populated from the actions just taken.
9. **Roles** — log in as a `VIEWER`-role second account, show that
   money-moving actions are simply not present in the UI, then attempt
   (and show the `403`) a direct API call to a Finance-only endpoint to
   demonstrate the enforcement is real, not just hidden UI.

## 2. What to emphasize to reviewers

- **Non-custodial**: every money-moving step required an explicit wallet
  signature; the backend only ever relayed already-signed transactions.
- **Auditable by design**: every action in the demo has a corresponding
  public Stellar Testnet transaction, clickable from the product itself.
- **Real partial-failure handling**: optionally include one employee with
  an intentionally deactivated on-chain registration in the payroll batch
  to show the `PARTIAL` status and per-item failure reason live, rather
  than only showing the happy path.
- **Modular contract architecture**: briefly show the six separately
  deployed contract addresses on Stellar Expert to make the "not one
  monolithic contract, not a proxy" architecture visible, not just
  claimed in docs.

## 3. Fallback plan

If live Testnet is congested/unavailable during a live presentation, a
pre-recorded run-through covering the same numbered steps should exist as
a backup, clearly labeled as a recording, with the live environment still
offered for reviewer-driven exploration afterward.

## 4. Post-demo Q&A anchors

Be ready to point directly at: [SMART_CONTRACT_SPECIFICATION.md](./SMART_CONTRACT_SPECIFICATION.md)
for "why these six contracts," [THREAT_MODEL.md](./THREAT_MODEL.md) for
"what have you considered that could go wrong," and
[ROADMAP.md](./ROADMAP.md) for "what's next."
