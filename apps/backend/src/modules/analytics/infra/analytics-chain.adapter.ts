import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { getTreasuryBalance, stellarNetworkConfig, stroopsToDecimal } from "@workforceos/sdk";

import type { AppConfig } from "../../../config/config.schema";

/**
 * docs/BACKEND_ARCHITECTURE.md §4: the only place in this module that
 * imports `packages/sdk` — the overview endpoint's treasury balance is
 * always read live from chain (docs/TREASURY_ARCHITECTURE.md §2), never a
 * cached Postgres column, same as `TreasuryService.getOverview`.
 */
@Injectable()
export class AnalyticsChainAdapter {
  private readonly config: ReturnType<typeof stellarNetworkConfig>;

  constructor(configService: ConfigService<AppConfig, true>) {
    this.config = stellarNetworkConfig({
      rpcUrl: configService.get("STELLAR_RPC_URL", { infer: true }),
      horizonUrl: configService.get("STELLAR_HORIZON_URL", { infer: true }),
    });
  }

  async getTreasuryBalance(treasuryContractId: string): Promise<string> {
    const stroops = await getTreasuryBalance(treasuryContractId, this.config);
    return stroopsToDecimal(stroops);
  }
}
