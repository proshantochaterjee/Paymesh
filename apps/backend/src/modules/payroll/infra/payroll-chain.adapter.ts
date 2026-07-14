import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  buildRunPayrollTransaction,
  getTreasuryBalance,
  stellarNetworkConfig,
  submitSignedTransaction,
  waitForTransactionConfirmation,
} from "@workforceos/sdk";

import type { AppConfig } from "../../../config/config.schema";

/**
 * docs/BACKEND_ARCHITECTURE.md §4: the only place in this module that
 * imports `packages/sdk`. `payroll_engine` is a network-wide singleton
 * (fixed address from config), matching `employee_registry` — unlike
 * treasury's per-org address.
 */
@Injectable()
export class PayrollChainAdapter {
  private readonly config: ReturnType<typeof stellarNetworkConfig>;
  private readonly payrollEngineContractId: string;

  constructor(configService: ConfigService<AppConfig, true>) {
    this.config = stellarNetworkConfig({
      rpcUrl: configService.get("STELLAR_RPC_URL", { infer: true }),
      horizonUrl: configService.get("STELLAR_HORIZON_URL", { infer: true }),
    });
    this.payrollEngineContractId = configService.get("STELLAR_PAYROLL_ENGINE_CONTRACT_ADDRESS", { infer: true });
  }

  /** Raw stroops, not a decimal string — the caller needs it for a stroops-precision comparison, not display. */
  async getTreasuryBalanceStroops(treasuryContractId: string): Promise<bigint> {
    return getTreasuryBalance(treasuryContractId, this.config);
  }

  async buildRunPayrollXdr(params: {
    authorizerAddress: string;
    onChainOrgId: bigint;
    runId: bigint;
    employeeIds: bigint[];
  }): Promise<{ unsignedXdr: string }> {
    return buildRunPayrollTransaction({
      payrollEngineContractId: this.payrollEngineContractId,
      authorizerAddress: params.authorizerAddress,
      onChainOrgId: params.onChainOrgId,
      runId: params.runId,
      employeeIds: params.employeeIds,
      config: this.config,
    });
  }

  async submitSignedXdr(signedXdr: string): Promise<{ stellarTxHash: string; status: string }> {
    return submitSignedTransaction(signedXdr, this.config);
  }

  /**
   * `run_payroll` returns `PayrollResult { succeeded: Vec<u64>, failed:
   * Vec<(u64, Symbol)> }` — needed synchronously (not deferred to Step
   * 13's indexer) since every `PayrollItem` in the chunk must be marked
   * PAID/FAILED before the run's aggregate status can be derived, same
   * reasoning as Employees' register-confirmation wait.
   */
  async waitForPayrollResult(
    stellarTxHash: string,
  ): Promise<{ succeeded: bigint[]; failed: Array<[bigint, string]> } | null> {
    const result = await waitForTransactionConfirmation(stellarTxHash, this.config);
    if (result.status !== "SUCCESS" || !result.returnValue || typeof result.returnValue !== "object") {
      return null;
    }
    const payload = result.returnValue as { succeeded?: unknown; failed?: unknown };
    if (!Array.isArray(payload.succeeded) || !Array.isArray(payload.failed)) {
      return null;
    }
    return {
      succeeded: payload.succeeded as bigint[],
      failed: payload.failed as Array<[bigint, string]>,
    };
  }
}
