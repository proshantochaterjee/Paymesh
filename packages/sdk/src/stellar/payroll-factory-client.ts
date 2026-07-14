import { contract } from "@stellar/stellar-sdk";

import type { StellarNetworkConfig } from "./network.js";
import { assertSimulationSucceeded } from "./simulation.js";

/** Mirrors `packages/contracts/payroll-factory/src/lib.rs`'s `OrgRecord` return shape — Address fields decode to their string (G.../C...) form. */
export interface OrgRecordResult {
  organization: string;
  treasury: string;
  owner: string;
}

/**
 * `payroll_factory` is the one network-wide singleton every organization
 * is created through (docs/BLOCKCHAIN_ARCHITECTURE.md §2), fetched
 * dynamically per this package's usual reasoning (see treasury-client.ts).
 * Verified against the real deployed contract
 * (packages/contracts/payroll-factory/src/lib.rs).
 */
interface PayrollFactoryContractClient {
  create_organization(
    args: { owner: string; salt: Buffer },
    opts?: { publicKey?: string },
  ): Promise<contract.AssembledTransaction<bigint>>;
  // `get_organization` returns `Result<OrgRecord, WorkforceError>` on the
  // Rust side, which decodes to `{ value: OrgRecord }` here, not a flat
  // OrgRecord (confirmed against the real deployed contract via
  // apps/backend/test/helpers/testnet-fixtures.ts's `createTestOrganization`,
  // which needed the same unwrap) — unlike `create_organization`, which
  // returns a plain `u64` with no `Result` wrapper.
  get_organization(
    args: { org_id: bigint },
    opts?: { publicKey?: string },
  ): Promise<contract.AssembledTransaction<{ value: OrgRecordResult }>>;
}

async function payrollFactoryClient(
  factoryContractId: string,
  config: StellarNetworkConfig,
): Promise<PayrollFactoryContractClient> {
  const client = await contract.Client.from({
    contractId: factoryContractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
  });
  return client as unknown as PayrollFactoryContractClient;
}

/**
 * `create_organization` requires the owner's own `require_auth()`
 * (packages/contracts/payroll-factory/src/lib.rs) — there is no
 * custodial path, so like every other on-chain mutation in this system
 * this only builds unsigned XDR for the caller's wallet to sign.
 */
export async function buildCreateOrganizationTransaction(params: {
  factoryContractId: string;
  ownerAddress: string;
  salt: Buffer;
  config: StellarNetworkConfig;
}): Promise<{ unsignedXdr: string }> {
  const client = await payrollFactoryClient(params.factoryContractId, params.config);
  const assembled = await client.create_organization(
    { owner: params.ownerAddress, salt: params.salt },
    { publicKey: params.ownerAddress },
  );
  assertSimulationSucceeded(assembled);
  return { unsignedXdr: assembled.toXDR() };
}

/**
 * Read-only lookup of the two contract addresses `create_organization`
 * deployed for a given `org_id` — no `require_auth()` on the contract
 * side, so this simulates and reads `.result` directly rather than
 * returning XDR for anyone to sign (same pattern as
 * `treasury-client.ts`'s `getTreasuryBalance`).
 */
export async function getOrganizationRecord(
  factoryContractId: string,
  onChainOrgId: bigint,
  config: StellarNetworkConfig,
): Promise<OrgRecordResult> {
  const client = await payrollFactoryClient(factoryContractId, config);
  const assembled = await client.get_organization({ org_id: onChainOrgId });
  return assembled.result.value;
}
