import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  buildCreateOrganizationTransaction,
  buildGrantRoleTransaction,
  buildRevokeRoleTransaction,
  getOrganizationRecord,
  stellarNetworkConfig,
  submitSignedTransaction,
  waitForTransactionConfirmation,
  type OrgRecordResult,
  type OrgRoleInput,
} from "@workforceos/sdk";

import type { AppConfig } from "../../../config/config.schema";

/**
 * docs/BACKEND_ARCHITECTURE.md §4: the only place in this module that
 * imports `packages/sdk`. `payroll_factory` is a network-wide singleton
 * (config, not DB); `organization` is deployed per-org, so grant/revoke
 * calls take that org's contract address as a parameter instead.
 */
@Injectable()
export class OrganizationsChainAdapter {
  private readonly config: ReturnType<typeof stellarNetworkConfig>;
  private readonly factoryContractId: string;

  constructor(configService: ConfigService<AppConfig, true>) {
    this.config = stellarNetworkConfig({
      rpcUrl: configService.get("STELLAR_RPC_URL", { infer: true }),
      horizonUrl: configService.get("STELLAR_HORIZON_URL", { infer: true }),
    });
    this.factoryContractId = configService.get("STELLAR_FACTORY_CONTRACT_ADDRESS", { infer: true });
  }

  async buildCreateOrganizationXdr(params: { ownerAddress: string; salt: Buffer }): Promise<{ unsignedXdr: string }> {
    return buildCreateOrganizationTransaction({
      factoryContractId: this.factoryContractId,
      ownerAddress: params.ownerAddress,
      salt: params.salt,
      config: this.config,
    });
  }

  async buildGrantRoleXdr(params: {
    organizationContractAddr: string;
    callerAddress: string;
    memberAddress: string;
    role: OrgRoleInput;
  }): Promise<{ unsignedXdr: string }> {
    return buildGrantRoleTransaction({
      organizationContractId: params.organizationContractAddr,
      callerAddress: params.callerAddress,
      memberAddress: params.memberAddress,
      role: params.role,
      config: this.config,
    });
  }

  async buildRevokeRoleXdr(params: {
    organizationContractAddr: string;
    callerAddress: string;
    memberAddress: string;
  }): Promise<{ unsignedXdr: string }> {
    return buildRevokeRoleTransaction({
      organizationContractId: params.organizationContractAddr,
      callerAddress: params.callerAddress,
      memberAddress: params.memberAddress,
      config: this.config,
    });
  }

  async submitSignedXdr(signedXdr: string): Promise<{ stellarTxHash: string; status: string }> {
    return submitSignedTransaction(signedXdr, this.config);
  }

  /** `create_organization` returns the new `org_id` — needed to look up the deployed contract addresses via `get_organization`. */
  async waitForConfirmedOrgId(stellarTxHash: string): Promise<bigint | null> {
    const result = await waitForTransactionConfirmation(stellarTxHash, this.config);
    if (result.status === "SUCCESS" && typeof result.returnValue === "bigint") {
      return result.returnValue;
    }
    return null;
  }

  /** Same reasoning as `EmployeesChainAdapter.waitForConfirmedSuccess`/`MilestonesChainAdapter.waitForConfirmedSuccess`. */
  async waitForConfirmedSuccess(stellarTxHash: string): Promise<boolean> {
    const result = await waitForTransactionConfirmation(stellarTxHash, this.config);
    return result.status === "SUCCESS";
  }

  async getOrganizationRecord(onChainOrgId: bigint): Promise<OrgRecordResult> {
    return getOrganizationRecord(this.factoryContractId, onChainOrgId, this.config);
  }
}
