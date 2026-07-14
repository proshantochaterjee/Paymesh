import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { getContractEvents, getLatestLedgerSequence, stellarNetworkConfig, type DecodedContractEvent } from "@workforceos/sdk";

import type { AppConfig } from "../../../config/config.schema";

export type { DecodedContractEvent } from "@workforceos/sdk";

/**
 * docs/BACKEND_ARCHITECTURE.md §4: the only place in this module that
 * imports `packages/sdk` — `IndexerService` never touches Stellar RPC
 * shapes directly, only this adapter's already-decoded event objects.
 */
@Injectable()
export class IndexerChainAdapter {
  private readonly config: ReturnType<typeof stellarNetworkConfig>;

  constructor(configService: ConfigService<AppConfig, true>) {
    this.config = stellarNetworkConfig({
      rpcUrl: configService.get("STELLAR_RPC_URL", { infer: true }),
      horizonUrl: configService.get("STELLAR_HORIZON_URL", { infer: true }),
    });
  }

  async getLatestLedgerSequence(): Promise<number> {
    return getLatestLedgerSequence(this.config);
  }

  async getContractEvents(contractId: string, startLedger: number): Promise<DecodedContractEvent[]> {
    return getContractEvents(contractId, startLedger, this.config);
  }
}
