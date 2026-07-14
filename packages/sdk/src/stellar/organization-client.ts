import { contract } from "@stellar/stellar-sdk";

import type { StellarNetworkConfig } from "./network.js";
import { assertSimulationSucceeded } from "./simulation.js";

/**
 * Mirrors `packages/contracts/common/src/role.rs`'s fieldless `Role` enum.
 * Same encoding as `employee-registry-client.ts`'s `PayFrequencyScVal`
 * (`{ tag, values: undefined }`, not a plain string) — confirmed against
 * the real deployed contract after a plain PascalCase string threw
 * `TypeError: no such enum entry: undefined` from `Spec.nativeToUnion`.
 * Distinct from this system's own `OrgRole` strings ("OWNER", "ADMIN", ...)
 * used everywhere off-chain (docs/PERMISSION_MODEL.md §1).
 */
type ContractRoleScVal = { tag: "Owner" | "Admin" | "Finance" | "Hr" | "Viewer"; values: undefined };

const ORG_ROLE_TO_CONTRACT_ROLE: Record<OrgRoleInput, ContractRoleScVal["tag"]> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  FINANCE: "Finance",
  HR: "Hr",
  VIEWER: "Viewer",
};

export type OrgRoleInput = "OWNER" | "ADMIN" | "FINANCE" | "HR" | "VIEWER";

function toContractRoleScVal(role: OrgRoleInput): ContractRoleScVal {
  return { tag: ORG_ROLE_TO_CONTRACT_ROLE[role], values: undefined };
}

/**
 * `organization` is deployed dynamically per org (like `treasury`), so
 * there's no single fixed address to codegen a static typed client
 * against — fetched dynamically per this package's usual reasoning.
 * Verified against the real deployed contract
 * (packages/contracts/organization/src/lib.rs).
 */
interface OrganizationContractClient {
  grant_role(
    args: { caller: string; member: string; role: ContractRoleScVal },
    opts?: { publicKey?: string },
  ): Promise<contract.AssembledTransaction<null>>;
  revoke_role(
    args: { caller: string; member: string },
    opts?: { publicKey?: string },
  ): Promise<contract.AssembledTransaction<null>>;
}

async function organizationClient(
  organizationContractId: string,
  config: StellarNetworkConfig,
): Promise<OrganizationContractClient> {
  const client = await contract.Client.from({
    contractId: organizationContractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
  });
  return client as unknown as OrganizationContractClient;
}

export async function buildGrantRoleTransaction(params: {
  organizationContractId: string;
  callerAddress: string;
  memberAddress: string;
  role: OrgRoleInput;
  config: StellarNetworkConfig;
}): Promise<{ unsignedXdr: string }> {
  const client = await organizationClient(params.organizationContractId, params.config);
  const assembled = await client.grant_role(
    { caller: params.callerAddress, member: params.memberAddress, role: toContractRoleScVal(params.role) },
    { publicKey: params.callerAddress },
  );
  assertSimulationSucceeded(assembled);
  return { unsignedXdr: assembled.toXDR() };
}

export async function buildRevokeRoleTransaction(params: {
  organizationContractId: string;
  callerAddress: string;
  memberAddress: string;
  config: StellarNetworkConfig;
}): Promise<{ unsignedXdr: string }> {
  const client = await organizationClient(params.organizationContractId, params.config);
  const assembled = await client.revoke_role(
    { caller: params.callerAddress, member: params.memberAddress },
    { publicKey: params.callerAddress },
  );
  assertSimulationSucceeded(assembled);
  return { unsignedXdr: assembled.toXDR() };
}
