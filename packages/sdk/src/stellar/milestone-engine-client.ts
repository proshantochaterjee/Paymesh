import { contract } from "@stellar/stellar-sdk";

import type { StellarNetworkConfig } from "./network.js";
import { assertSimulationSucceeded } from "./simulation.js";

/**
 * `milestone_engine` is a network-wide singleton (fixed address, like
 * `employee_registry`/`payroll_engine`), fetched dynamically per this
 * file's usual reasoning. Verified against the real deployed contract
 * (packages/contracts/milestone-engine/src/lib.rs).
 */
interface MilestoneEngineContractClient {
  create_milestone(
    args: { caller: string; org_id: bigint; contractor: string; amount: bigint },
    opts?: { publicKey?: string },
  ): Promise<contract.AssembledTransaction<bigint>>;
  fund_milestone(
    args: { caller: string; org_id: bigint; milestone_id: bigint },
    opts?: { publicKey?: string },
  ): Promise<contract.AssembledTransaction<null>>;
  approve_milestone(
    args: { caller: string; org_id: bigint; milestone_id: bigint },
    opts?: { publicKey?: string },
  ): Promise<contract.AssembledTransaction<null>>;
  release_milestone(
    args: { caller: string; org_id: bigint; milestone_id: bigint },
    opts?: { publicKey?: string },
  ): Promise<contract.AssembledTransaction<null>>;
  cancel_milestone(
    args: { caller: string; org_id: bigint; milestone_id: bigint },
    opts?: { publicKey?: string },
  ): Promise<contract.AssembledTransaction<null>>;
}

async function milestoneEngineClient(
  milestoneEngineContractId: string,
  config: StellarNetworkConfig,
): Promise<MilestoneEngineContractClient> {
  const client = await contract.Client.from({
    contractId: milestoneEngineContractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
  });
  return client as unknown as MilestoneEngineContractClient;
}

export async function buildCreateMilestoneTransaction(params: {
  milestoneEngineContractId: string;
  callerAddress: string;
  onChainOrgId: bigint;
  contractorAddress: string;
  amountStroops: bigint;
  config: StellarNetworkConfig;
}): Promise<{ unsignedXdr: string }> {
  const client = await milestoneEngineClient(params.milestoneEngineContractId, params.config);
  const assembled = await client.create_milestone(
    { caller: params.callerAddress, org_id: params.onChainOrgId, contractor: params.contractorAddress, amount: params.amountStroops },
    { publicKey: params.callerAddress },
  );
  assertSimulationSucceeded(assembled);
  return { unsignedXdr: assembled.toXDR() };
}

async function buildSingleMilestoneCallTransaction(
  method: "fund_milestone" | "approve_milestone" | "release_milestone" | "cancel_milestone",
  params: {
    milestoneEngineContractId: string;
    callerAddress: string;
    onChainOrgId: bigint;
    onChainMilestoneId: bigint;
    config: StellarNetworkConfig;
  },
): Promise<{ unsignedXdr: string }> {
  const client = await milestoneEngineClient(params.milestoneEngineContractId, params.config);
  const assembled = await client[method](
    { caller: params.callerAddress, org_id: params.onChainOrgId, milestone_id: params.onChainMilestoneId },
    { publicKey: params.callerAddress },
  );
  assertSimulationSucceeded(assembled);
  return { unsignedXdr: assembled.toXDR() };
}

export const buildFundMilestoneTransaction = (params: Parameters<typeof buildSingleMilestoneCallTransaction>[1]) =>
  buildSingleMilestoneCallTransaction("fund_milestone", params);

export const buildApproveMilestoneTransaction = (params: Parameters<typeof buildSingleMilestoneCallTransaction>[1]) =>
  buildSingleMilestoneCallTransaction("approve_milestone", params);

export const buildReleaseMilestoneTransaction = (params: Parameters<typeof buildSingleMilestoneCallTransaction>[1]) =>
  buildSingleMilestoneCallTransaction("release_milestone", params);

export const buildCancelMilestoneTransaction = (params: Parameters<typeof buildSingleMilestoneCallTransaction>[1]) =>
  buildSingleMilestoneCallTransaction("cancel_milestone", params);
