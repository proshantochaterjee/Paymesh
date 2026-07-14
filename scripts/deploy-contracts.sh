#!/usr/bin/env bash
# Deploys the WorkforceOS contract set to Stellar Testnet, per
# docs/DEPLOYMENT_GUIDE.md §2. Idempotent: if
# deployed-addresses.testnet.json already exists, exits without
# re-deploying (pass --force to redeploy everything from scratch, which
# creates brand-new contract instances — the old ones are not reachable
# through the new addresses file but remain live on-chain, since Soroban
# contracts are immutable/not deletable, per DEPLOYMENT_GUIDE.md §7).
#
# Usage: scripts/deploy-contracts.sh [--force]
#   STELLAR_DEPLOYER_IDENTITY   stellar CLI identity name to deploy/sign
#                               with (default: workforceos-deployer).
#                               Must already exist and be funded:
#                               `stellar keys generate <name> --network
#                               testnet --fund`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADDRESSES_FILE="$REPO_ROOT/deployed-addresses.testnet.json"
IDENTITY="${STELLAR_DEPLOYER_IDENTITY:-workforceos-deployer}"
FORCE=false
[[ "${1:-}" == "--force" ]] && FORCE=true

if [[ -f "$ADDRESSES_FILE" && "$FORCE" == false ]]; then
  echo "$ADDRESSES_FILE already exists — skipping deploy. Pass --force to redeploy." >&2
  exit 0
fi

DEPLOYER_PUBLIC_KEY="$(stellar keys address "$IDENTITY")"
echo "Deploying as $IDENTITY ($DEPLOYER_PUBLIC_KEY)"

echo "1/4 Building contracts..."
cargo build --manifest-path "$REPO_ROOT/packages/contracts/Cargo.toml" \
  --target wasm32v1-none --release

WASM_DIR="$REPO_ROOT/packages/contracts/target/wasm32v1-none/release"

echo "2/4 Deploying USDC SAC (self-issued TUSDC — see docs/DEPLOYMENT_GUIDE.md §3)..."
USDC_SAC=$(stellar contract asset deploy \
  --asset "TUSDC:$DEPLOYER_PUBLIC_KEY" \
  --source-account "$IDENTITY" --network testnet)

echo "3/4 Uploading contract WASM..."
ORG_HASH=$(stellar contract upload --source-account "$IDENTITY" --network testnet --wasm "$WASM_DIR/organization.wasm")
TREASURY_HASH=$(stellar contract upload --source-account "$IDENTITY" --network testnet --wasm "$WASM_DIR/treasury.wasm")
EMPLOYEE_REGISTRY_HASH=$(stellar contract upload --source-account "$IDENTITY" --network testnet --wasm "$WASM_DIR/employee_registry.wasm")
PAYROLL_ENGINE_HASH=$(stellar contract upload --source-account "$IDENTITY" --network testnet --wasm "$WASM_DIR/payroll_engine.wasm")
MILESTONE_ENGINE_HASH=$(stellar contract upload --source-account "$IDENTITY" --network testnet --wasm "$WASM_DIR/milestone_engine.wasm")
FACTORY_HASH=$(stellar contract upload --source-account "$IDENTITY" --network testnet --wasm "$WASM_DIR/payroll_factory.wasm")

echo "4/4 Deploying + initializing contracts..."
# organization/treasury are never deployed standalone — payroll_factory
# deploys a fresh instance of each per organization (see
# packages/contracts/payroll-factory/src/lib.rs's create_organization).
EMPLOYEE_REGISTRY=$(stellar contract deploy --source-account "$IDENTITY" --network testnet --wasm-hash "$EMPLOYEE_REGISTRY_HASH")
PAYROLL_ENGINE=$(stellar contract deploy --source-account "$IDENTITY" --network testnet --wasm-hash "$PAYROLL_ENGINE_HASH")
MILESTONE_ENGINE=$(stellar contract deploy --source-account "$IDENTITY" --network testnet --wasm-hash "$MILESTONE_ENGINE_HASH")
FACTORY=$(stellar contract deploy --source-account "$IDENTITY" --network testnet --wasm-hash "$FACTORY_HASH")

# Dependency order resolves the factory<->singletons circular reference:
# addresses are known at deploy time, before any initialize() call.
stellar contract invoke --id "$EMPLOYEE_REGISTRY" --source-account "$IDENTITY" --network testnet -- \
  initialize --factory "$FACTORY"
stellar contract invoke --id "$PAYROLL_ENGINE" --source-account "$IDENTITY" --network testnet -- \
  initialize --factory "$FACTORY" --employee_registry "$EMPLOYEE_REGISTRY"
stellar contract invoke --id "$MILESTONE_ENGINE" --source-account "$IDENTITY" --network testnet -- \
  initialize --factory "$FACTORY" --token "$USDC_SAC"
stellar contract invoke --id "$FACTORY" --source-account "$IDENTITY" --network testnet -- \
  initialize --admin "$DEPLOYER_PUBLIC_KEY" --usdc_token "$USDC_SAC" \
  --org_wasm_hash "$ORG_HASH" --treasury_wasm_hash "$TREASURY_HASH" \
  --employee_registry "$EMPLOYEE_REGISTRY" --payroll_engine "$PAYROLL_ENGINE" \
  --milestone_engine "$MILESTONE_ENGINE"

cat > "$ADDRESSES_FILE" <<JSON
{
  "network": "testnet",
  "deployerPublicKey": "$DEPLOYER_PUBLIC_KEY",
  "usdcSac": "$USDC_SAC",
  "payrollFactory": "$FACTORY",
  "employeeRegistry": "$EMPLOYEE_REGISTRY",
  "payrollEngine": "$PAYROLL_ENGINE",
  "milestoneEngine": "$MILESTONE_ENGINE",
  "organizationWasmHash": "$ORG_HASH",
  "treasuryWasmHash": "$TREASURY_HASH"
}
JSON

echo "Wrote $ADDRESSES_FILE"
cat "$ADDRESSES_FILE"
