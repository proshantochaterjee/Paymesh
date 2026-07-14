import { contract } from "@stellar/stellar-sdk";

import type { StellarNetworkConfig } from "./network.js";
import { assertSimulationSucceeded } from "./simulation.js";

/**
 * `payroll_engine` is a network-wide singleton (fixed address, like
 * `employee_registry`), fetched dynamically per this file's usual
 * reasoning (no codegen step in this project). Verified against the real
 * deployed contract (packages/contracts/payroll-engine/src/lib.rs).
 */
interface PayrollEngineContractClient {
  run_payroll(
    args: { authorizer: string; org_id: bigint; run_id: bigint; employee_ids: bigint[] },
    opts?: { publicKey?: string },
  ): Promise<contract.AssembledTransaction<{ succeeded: bigint[]; failed: [bigint, string][] }>>;
}

async function payrollEngineClient(
  payrollEngineContractId: string,
  config: StellarNetworkConfig,
): Promise<PayrollEngineContractClient> {
  const client = await contract.Client.from({
    contractId: payrollEngineContractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
  });
  return client as unknown as PayrollEngineContractClient;
}

/**
 * One chunk of a payroll run — `employeeIds` must already be sized to fit
 * within `PAYROLL_CHUNK_SIZE` (docs/PAYROLL_ENGINE.md §2); this file has
 * no opinion on chunking, that's the caller's job.
 */
export async function buildRunPayrollTransaction(params: {
  payrollEngineContractId: string;
  authorizerAddress: string;
  onChainOrgId: bigint;
  runId: bigint;
  employeeIds: bigint[];
  config: StellarNetworkConfig;
}): Promise<{ unsignedXdr: string }> {
  const client = await payrollEngineClient(params.payrollEngineContractId, params.config);
  const assembled = await client.run_payroll(
    {
      authorizer: params.authorizerAddress,
      org_id: params.onChainOrgId,
      run_id: params.runId,
      employee_ids: params.employeeIds,
    },
    { publicKey: params.authorizerAddress },
  );
  assertSimulationSucceeded(assembled);
  return { unsignedXdr: assembled.toXDR() };
}
