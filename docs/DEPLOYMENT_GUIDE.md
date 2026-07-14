# Deployment Guide

## 1. Prerequisites

- Node.js 20+, npm, Rust stable + `wasm32v1-none` target, the `stellar`
  CLI (23.x — the current name for what was `soroban-cli`; `soroban
  contract install` is now `stellar contract upload`, `--source` is now
  `--source-account`), Docker (for local Postgres/Redis).
  `wasm32v1-none` (not the older `wasm32-unknown-unknown`) because
  `soroban-sdk` 26.x's build script rejects `wasm32-unknown-unknown` on
  Rust 1.82+ (that target gained reference-types/multi-value features
  Soroban's host doesn't yet support) — verified directly against the
  toolchain while building Step 4's contracts.
- A funded Stellar Testnet account for contract deployment
  (`stellar keys generate <name> --network testnet --fund`, or fund an
  existing key via Friendbot: `https://friendbot.stellar.org`). Use a
  project-scoped identity name — a shared dev machine may already have
  many unrelated `stellar keys` identities.
- Accounts/CLI access: Vercel, Railway (or Render), GitHub (for Actions
  secrets).

## 2. Contract deployment (Testnet)

`scripts/deploy-contracts.sh` is the idempotent, actually-used deployment
script (see it for the exact commands/order) — this section explains
what it does and why, rather than duplicating its content:

1. Builds all 6 contracts to WASM.
2. Deploys the USDC SAC — **self-issued `TUSDC`, decision recorded**: the
   deployer account itself is the issuer (`stellar contract asset deploy
   --asset TUSDC:$DEPLOYER_PUBLIC_KEY`), not Circle's Testnet USDC
   issuer. `BLOCKCHAIN_ARCHITECTURE.md` §1 left this open pending
   whichever "is available and stable enough for demo purposes" —
   self-issuing has no external dependency, isn't at risk of the issuer
   changing/disappearing, and the issuer account (ourselves) can mint
   arbitrary TUSDC for demo/seed treasury deposits.
3. Uploads all 6 contracts' WASM (returns a hash per contract — this step
   does not create a contract instance or address, just stores the code).
4. Deploys (instantiates) `payroll_factory`, `employee_registry`,
   `payroll_engine`, `milestone_engine` from their uploaded hashes — each
   deploy assigns the instance its address, before any `initialize` call.
   **`organization` and `treasury` are never deployed standalone** — only
   their WASM hashes are uploaded; `payroll_factory.create_organization`
   deploys a fresh instance of each dynamically, per organization
   (`packages/contracts/payroll-factory/src/lib.rs`).
5. Calls `initialize` on the 4 deployed contracts, in dependency order —
   `employee_registry`/`payroll_engine`/`milestone_engine` each take a
   `factory: Address` param, and `payroll_factory.initialize` takes all
   three singletons' addresses back, a circular reference resolved by the
   fact that Soroban contract addresses are known at deploy time, before
   `initialize` is ever called: deploy all 4 first (step 4), then
   initialize in any order once every address is known.

Writes the resulting addresses to `deployed-addresses.<network>.json` at
the repo root (committed — the addresses are public information, nothing
secret about a contract ID) so the backend's config can reference them.

## 3. Recorded Testnet contract addresses

Deployed by `scripts/deploy-contracts.sh`, recorded in
`deployed-addresses.testnet.json`:

| Contract | Address |
|---|---|
| USDC SAC (Testnet, self-issued `TUSDC`) | `CBKL4AWQPCWLDVDZ4MPYM4AWLDEKBU3KUTDVQ7AGW77P6KR23YIIUTNL` |
| `payroll_factory` | `CD2GIPUVLMB36V6XLTN7KJ6CGJOSUWRTLSC2WAGIXDJLPCTZF657JLX3` |
| `employee_registry` | `CB3G6PXAKCEZAB6W2P27LY7UMZBL6YMD6ZUP4Q2HCKRRZIWERB2H7AML` |
| `payroll_engine` | `CANMOFXMXPPGOVXK4ISAM4R75ESFFDWGKAZG2S4W4JTWKD2BMMNLPYVZ` |
| `milestone_engine` | `CD3XEYY3J7HPQLJSY64LIQC6R7OXG6N2WNTHSWQTXCXNI3ZYQI2V2R5B` |

`organization`/`treasury` WASM hashes (used by `payroll_factory` to
deploy each org's pair dynamically, not addresses of their own):
`organizationWasmHash` / `treasuryWasmHash` in
`deployed-addresses.testnet.json`.

(Per-org `organization`/`treasury` *addresses* are not listed here —
they're created dynamically per organization and stored in the
`Organization` table. Verified end-to-end with a real
`create_organization` call against the addresses above during Step 9:
org id 1, organization `CDW3QNJJZUYMDKFUT2EHCFPLQVCM2AXFYUREKMRHWCW5WJFUQDSVAMJL`,
treasury `CDYXQNYNG5DZ2U4ENPWWRLMCZ4GPTFDXEJQ4XJYZAFCQG4Y75L6SVGA3` — a
real, permanent (Soroban contracts aren't deletable) smoke-test artifact
on Testnet, harmless to leave in place.)

## 4. Backend deployment (Railway/Render)

1. Create a Postgres database instance.
2. Create a service from the `apps/backend` directory (or the built
   `backend.Dockerfile` image), set `DATABASE_URL` to the provisioned
   Postgres, plus all `stellar.*` and `auth.*` config vars per
   [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) §7.
3. Set the deploy command to run `prisma migrate deploy` before starting
   the server (Railway/Render "pre-deploy command" or a start script that
   runs migration then `node dist/main.js`).
4. Create a second service (same image, different start command) for the
   Event Indexer worker, pointed at the same database.
5. Optionally provision Redis if BullMQ-backed indexing/queueing is
   enabled.

## 5. Frontend deployment (Vercel)

1. Import the repo, set the project root to `apps/frontend`.
2. Set `NEXT_PUBLIC_API_URL` to the deployed backend's public URL and
   `NEXT_PUBLIC_STELLAR_NETWORK=testnet`.
3. Vercel's default Next.js build/output detection handles the rest;
   confirm `output: 'standalone'` isn't required for Vercel's own
   deployment (that setting is for the Docker path only — Vercel uses its
   own build pipeline, not `docker/frontend.Dockerfile`).

## 6. Post-deploy smoke test

Run the [SCF_DEMO.md](./SCF_DEMO.md) script's first three steps
(register, create org, deposit) against the freshly deployed environment
before considering a deploy successful — this is the minimum "did the
whole chain actually work end to end" check beyond CI's automated tests.

## 7. Rollback

- **Frontend/Backend**: redeploy the previous Vercel/Railway build
  (both platforms keep prior deployments addressable) — no data
  migration concerns since these are stateless app layers.
- **Database**: only forward migrations in the expand/contract style
  described in [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) — "rollback" a
  bad migration by writing and deploying a new corrective migration, never
  by reverting to an old backend build against a newer schema.
- **Contracts**: not rollback-able (immutable once deployed) — a bad
  contract deploy is fixed by deploying a corrected version and, for the
  shared singletons, having orgs migrate their pointer
  ([BLOCKCHAIN_ARCHITECTURE.md](./BLOCKCHAIN_ARCHITECTURE.md) §4); for a
  bad `payroll_factory`/per-org contract, affected orgs would need to be
  recreated, which is why factory/org/treasury contract code gets the most
  thorough pre-deploy review and testing of anything in the system.
