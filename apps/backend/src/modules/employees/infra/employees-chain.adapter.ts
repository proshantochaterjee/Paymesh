import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  buildDeactivateEmployeeTransaction,
  buildRegisterEmployeeTransaction,
  buildUpdateEmployeeTransaction,
  decimalToStroops,
  stellarNetworkConfig,
  submitSignedTransaction,
  waitForTransactionConfirmation,
} from "@workforceos/sdk";
import type { PayFrequency } from "@workforceos/shared";

import type { AppConfig } from "../../../config/config.schema";

/**
 * docs/BACKEND_ARCHITECTURE.md §4: the only place in this module that
 * imports `packages/sdk`. Unlike treasury's per-org contract address,
 * `employee_registry` is a network-wide singleton (docs/BLOCKCHAIN_ARCHITECTURE.md
 * §2), so its address comes from config, not the database.
 */
@Injectable()
export class EmployeesChainAdapter {
  private readonly config: ReturnType<typeof stellarNetworkConfig>;
  private readonly employeeRegistryContractId: string;
  private readonly usdcSacAddress: string;

  constructor(configService: ConfigService<AppConfig, true>) {
    this.config = stellarNetworkConfig({
      rpcUrl: configService.get("STELLAR_RPC_URL", { infer: true }),
      horizonUrl: configService.get("STELLAR_HORIZON_URL", { infer: true }),
    });
    this.employeeRegistryContractId = configService.get("STELLAR_EMPLOYEE_REGISTRY_CONTRACT_ADDRESS", {
      infer: true,
    });
    this.usdcSacAddress = configService.get("STELLAR_USDC_SAC_ADDRESS", { infer: true });
  }

  async buildRegisterXdr(params: {
    callerAddress: string;
    onChainOrgId: bigint;
    wallet: string;
    salary: string;
    frequency: PayFrequency;
  }): Promise<{ unsignedXdr: string }> {
    return buildRegisterEmployeeTransaction({
      employeeRegistryContractId: this.employeeRegistryContractId,
      callerAddress: params.callerAddress,
      orgId: params.onChainOrgId,
      wallet: params.wallet,
      salaryStroops: decimalToStroops(params.salary),
      currency: this.usdcSacAddress,
      frequency: params.frequency,
      config: this.config,
    });
  }

  async buildUpdateXdr(params: {
    callerAddress: string;
    onChainOrgId: bigint;
    onChainEmployeeId: bigint;
    salary: string;
    frequency: PayFrequency;
  }): Promise<{ unsignedXdr: string }> {
    return buildUpdateEmployeeTransaction({
      employeeRegistryContractId: this.employeeRegistryContractId,
      callerAddress: params.callerAddress,
      orgId: params.onChainOrgId,
      employeeId: params.onChainEmployeeId,
      salaryStroops: decimalToStroops(params.salary),
      frequency: params.frequency,
      config: this.config,
    });
  }

  async buildDeactivateXdr(params: {
    callerAddress: string;
    onChainOrgId: bigint;
    onChainEmployeeId: bigint;
  }): Promise<{ unsignedXdr: string }> {
    return buildDeactivateEmployeeTransaction({
      employeeRegistryContractId: this.employeeRegistryContractId,
      callerAddress: params.callerAddress,
      orgId: params.onChainOrgId,
      employeeId: params.onChainEmployeeId,
      config: this.config,
    });
  }

  async submitSignedXdr(signedXdr: string): Promise<{ stellarTxHash: string; status: string }> {
    return submitSignedTransaction(signedXdr, this.config);
  }

  /**
   * `register_employee` returns the new `employee_id` — needed
   * immediately to backfill `Employee.onChainEmployeeId`
   * (docs/EMPLOYEE_MODEL.md §3).
   */
  async waitForRegisteredEmployeeId(stellarTxHash: string): Promise<bigint | null> {
    const result = await waitForTransactionConfirmation(stellarTxHash, this.config);
    if (result.status === "SUCCESS" && typeof result.returnValue === "bigint") {
      return result.returnValue;
    }
    return null;
  }

  /**
   * `submitSignedXdr` only confirms a transaction was accepted into the
   * mempool, not applied in a closed ledger — an account's on-ledger
   * sequence number only advances once it actually applies. A realistic
   * user flow chains several on-chain actions for the same employee in
   * quick succession (e.g. update then deactivate, same signer): building
   * the next one too soon can reuse a sequence number the still-pending
   * prior transaction already claimed, failing at submit time with a
   * confusing `CHAIN_SUBMISSION_FAILED` rather than any validation error.
   * Found via real end-to-end testing (Step 12, chasing the identical
   * root cause in Milestones' state-machine transitions) — fixed by
   * waiting for real confirmation before the service reports success, so
   * a caller who waits for this response is safe to immediately chain
   * the next action.
   */
  async waitForConfirmedSuccess(stellarTxHash: string): Promise<boolean> {
    const result = await waitForTransactionConfirmation(stellarTxHash, this.config);
    return result.status === "SUCCESS";
  }
}
