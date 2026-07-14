import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  buildTreasuryDepositTransaction,
  buildTreasuryWithdrawTransaction,
  decimalToStroops,
  getTreasuryBalance,
  stellarNetworkConfig,
  stroopsToDecimal,
  submitSignedTransaction,
} from "@workforceos/sdk";

import type { AppConfig } from "../../../config/config.schema";

/**
 * docs/BACKEND_ARCHITECTURE.md §4: the only place in this module that
 * imports `packages/sdk` — the rest of the module has no idea Stellar
 * exists, it just asks this adapter for an unsigned XDR or a balance.
 */
@Injectable()
export class TreasuryChainAdapter {
  private readonly config: ReturnType<typeof stellarNetworkConfig>;

  constructor(configService: ConfigService<AppConfig, true>) {
    this.config = stellarNetworkConfig({
      rpcUrl: configService.get("STELLAR_RPC_URL", { infer: true }),
      horizonUrl: configService.get("STELLAR_HORIZON_URL", { infer: true }),
    });
  }

  async buildDepositXdr(params: {
    treasuryContractId: string;
    fromAddress: string;
    amount: string;
  }): Promise<{ unsignedXdr: string }> {
    return buildTreasuryDepositTransaction({
      treasuryContractId: params.treasuryContractId,
      fromAddress: params.fromAddress,
      amountStroops: decimalToStroops(params.amount),
      config: this.config,
    });
  }

  async buildWithdrawXdr(params: {
    treasuryContractId: string;
    callerAddress: string;
    toAddress: string;
    amount: string;
  }): Promise<{ unsignedXdr: string }> {
    return buildTreasuryWithdrawTransaction({
      treasuryContractId: params.treasuryContractId,
      callerAddress: params.callerAddress,
      toAddress: params.toAddress,
      amountStroops: decimalToStroops(params.amount),
      config: this.config,
    });
  }

  async submitSignedXdr(signedXdr: string): Promise<{ stellarTxHash: string; status: string }> {
    return submitSignedTransaction(signedXdr, this.config);
  }

  async getBalance(treasuryContractId: string): Promise<string> {
    const stroops = await getTreasuryBalance(treasuryContractId, this.config);
    return stroopsToDecimal(stroops);
  }
}
