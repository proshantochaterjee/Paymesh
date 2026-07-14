import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  buildApproveMilestoneTransaction,
  buildCancelMilestoneTransaction,
  buildCreateMilestoneTransaction,
  buildFundMilestoneTransaction,
  buildReleaseMilestoneTransaction,
  stellarNetworkConfig,
  submitSignedTransaction,
  waitForTransactionConfirmation,
} from "@workforceos/sdk";

import type { AppConfig } from "../../../config/config.schema";

/**
 * docs/BACKEND_ARCHITECTURE.md §4: the only place in this module that
 * imports `packages/sdk`. `milestone_engine` is a network-wide singleton
 * (fixed address from config), matching `employee_registry`/`payroll_engine`.
 */
@Injectable()
export class MilestonesChainAdapter {
  private readonly config: ReturnType<typeof stellarNetworkConfig>;
  private readonly milestoneEngineContractId: string;

  constructor(configService: ConfigService<AppConfig, true>) {
    this.config = stellarNetworkConfig({
      rpcUrl: configService.get("STELLAR_RPC_URL", { infer: true }),
      horizonUrl: configService.get("STELLAR_HORIZON_URL", { infer: true }),
    });
    this.milestoneEngineContractId = configService.get("STELLAR_MILESTONE_ENGINE_CONTRACT_ADDRESS", { infer: true });
  }

  async buildCreateXdr(params: {
    callerAddress: string;
    onChainOrgId: bigint;
    contractorAddress: string;
    amountStroops: bigint;
  }): Promise<{ unsignedXdr: string }> {
    return buildCreateMilestoneTransaction({
      milestoneEngineContractId: this.milestoneEngineContractId,
      callerAddress: params.callerAddress,
      onChainOrgId: params.onChainOrgId,
      contractorAddress: params.contractorAddress,
      amountStroops: params.amountStroops,
      config: this.config,
    });
  }

  private singleCallParams(params: { callerAddress: string; onChainOrgId: bigint; onChainMilestoneId: bigint }) {
    return { ...params, milestoneEngineContractId: this.milestoneEngineContractId, config: this.config };
  }

  async buildFundXdr(params: { callerAddress: string; onChainOrgId: bigint; onChainMilestoneId: bigint }) {
    return buildFundMilestoneTransaction(this.singleCallParams(params));
  }

  async buildApproveXdr(params: { callerAddress: string; onChainOrgId: bigint; onChainMilestoneId: bigint }) {
    return buildApproveMilestoneTransaction(this.singleCallParams(params));
  }

  async buildReleaseXdr(params: { callerAddress: string; onChainOrgId: bigint; onChainMilestoneId: bigint }) {
    return buildReleaseMilestoneTransaction(this.singleCallParams(params));
  }

  async buildCancelXdr(params: { callerAddress: string; onChainOrgId: bigint; onChainMilestoneId: bigint }) {
    return buildCancelMilestoneTransaction(this.singleCallParams(params));
  }

  async submitSignedXdr(signedXdr: string): Promise<{ stellarTxHash: string; status: string }> {
    return submitSignedTransaction(signedXdr, this.config);
  }

  /**
   * `create_milestone` returns the new `milestone_id` synchronously —
   * needed immediately (not deferred to Step 13's indexer) to backfill
   * `Milestone.onChainMilestoneId`, same reasoning as Employees' and
   * Payroll's confirmation waits.
   */
  async waitForCreatedMilestoneId(stellarTxHash: string): Promise<bigint | null> {
    const result = await waitForTransactionConfirmation(stellarTxHash, this.config);
    if (result.status === "SUCCESS" && typeof result.returnValue === "bigint") {
      return result.returnValue;
    }
    return null;
  }

  /**
   * Every milestone transition after this one re-simulates against
   * *current* on-chain state (`assert_transition` checks the contract's
   * own status) — `submitSignedXdr` only confirms the transaction was
   * accepted into the mempool, not applied in a closed ledger. Chaining
   * fund -> approve -> release quickly (a realistic Finance workflow) can
   * otherwise simulate the next step before the previous one has actually
   * landed, failing with a misleading `SIMULATION_FAILED`. Fixed in Step
   * 12 by waiting for real confirmation before the service updates
   * Postgres status or lets the caller move to the next step — found via
   * real end-to-end testing, not something a mock would surface.
   */
  async waitForConfirmedSuccess(stellarTxHash: string): Promise<boolean> {
    const result = await waitForTransactionConfirmation(stellarTxHash, this.config);
    return result.status === "SUCCESS";
  }
}
