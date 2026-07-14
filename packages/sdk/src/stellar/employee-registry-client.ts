import { contract } from "@stellar/stellar-sdk";

import type { StellarNetworkConfig } from "./network.js";
import { assertSimulationSucceeded } from "./simulation.js";

/**
 * `employee_registry` is a network-wide singleton (fixed address, unlike
 * `treasury`), but still fetched dynamically rather than statically
 * codegen'd — same reasoning as `treasury-client.ts`: no codegen step
 * exists in this project, and a dynamic fetch keeps this file the only
 * place that needs to know the contract's real function signatures.
 * Verified against the real deployed contract
 * (packages/contracts/employee-registry/src/lib.rs).
 */
interface EmployeeRegistryContractClient {
  register_employee(
    args: {
      caller: string;
      org_id: bigint;
      wallet: string;
      salary: bigint;
      currency: string;
      frequency: PayFrequencyScVal;
    },
    opts?: { publicKey?: string },
  ): Promise<contract.AssembledTransaction<bigint>>;
  update_employee(
    args: { caller: string; org_id: bigint; employee_id: bigint; salary: bigint; frequency: PayFrequencyScVal },
    opts?: { publicKey?: string },
  ): Promise<contract.AssembledTransaction<null>>;
  deactivate_employee(
    args: { caller: string; org_id: bigint; employee_id: bigint },
    opts?: { publicKey?: string },
  ): Promise<contract.AssembledTransaction<null>>;
}

/** Soroban encoding for `common::types::PayFrequency`'s fieldless variants. */
type PayFrequencyScVal = { tag: "Weekly" | "BiWeekly" | "Monthly"; values: undefined };

export function toPayFrequencyScVal(frequency: "WEEKLY" | "BI_WEEKLY" | "MONTHLY"): PayFrequencyScVal {
  const tag = { WEEKLY: "Weekly", BI_WEEKLY: "BiWeekly", MONTHLY: "Monthly" } as const;
  return { tag: tag[frequency], values: undefined };
}

async function employeeRegistryClient(
  employeeRegistryContractId: string,
  config: StellarNetworkConfig,
): Promise<EmployeeRegistryContractClient> {
  const client = await contract.Client.from({
    contractId: employeeRegistryContractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
  });
  return client as unknown as EmployeeRegistryContractClient;
}

export async function buildRegisterEmployeeTransaction(params: {
  employeeRegistryContractId: string;
  callerAddress: string;
  orgId: bigint;
  wallet: string;
  salaryStroops: bigint;
  currency: string;
  frequency: "WEEKLY" | "BI_WEEKLY" | "MONTHLY";
  config: StellarNetworkConfig;
}): Promise<{ unsignedXdr: string }> {
  const client = await employeeRegistryClient(params.employeeRegistryContractId, params.config);
  const assembled = await client.register_employee(
    {
      caller: params.callerAddress,
      org_id: params.orgId,
      wallet: params.wallet,
      salary: params.salaryStroops,
      currency: params.currency,
      frequency: toPayFrequencyScVal(params.frequency),
    },
    { publicKey: params.callerAddress },
  );
  assertSimulationSucceeded(assembled);
  return { unsignedXdr: assembled.toXDR() };
}

export async function buildUpdateEmployeeTransaction(params: {
  employeeRegistryContractId: string;
  callerAddress: string;
  orgId: bigint;
  employeeId: bigint;
  salaryStroops: bigint;
  frequency: "WEEKLY" | "BI_WEEKLY" | "MONTHLY";
  config: StellarNetworkConfig;
}): Promise<{ unsignedXdr: string }> {
  const client = await employeeRegistryClient(params.employeeRegistryContractId, params.config);
  const assembled = await client.update_employee(
    {
      caller: params.callerAddress,
      org_id: params.orgId,
      employee_id: params.employeeId,
      salary: params.salaryStroops,
      frequency: toPayFrequencyScVal(params.frequency),
    },
    { publicKey: params.callerAddress },
  );
  assertSimulationSucceeded(assembled);
  return { unsignedXdr: assembled.toXDR() };
}

export async function buildDeactivateEmployeeTransaction(params: {
  employeeRegistryContractId: string;
  callerAddress: string;
  orgId: bigint;
  employeeId: bigint;
  config: StellarNetworkConfig;
}): Promise<{ unsignedXdr: string }> {
  const client = await employeeRegistryClient(params.employeeRegistryContractId, params.config);
  const assembled = await client.deactivate_employee(
    { caller: params.callerAddress, org_id: params.orgId, employee_id: params.employeeId },
    { publicKey: params.callerAddress },
  );
  assertSimulationSucceeded(assembled);
  return { unsignedXdr: assembled.toXDR() };
}
