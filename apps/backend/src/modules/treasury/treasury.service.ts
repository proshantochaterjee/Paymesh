import { Injectable } from "@nestjs/common";
import { decimalToStroops, stroopsToDecimal } from "@workforceos/sdk";
import type { DepositIntentInput, WithdrawIntentInput } from "@workforceos/shared";

import { DomainException } from "../../common/exceptions/domain.exception";
import { IntentService } from "../../common/intent/intent.service";
import { TreasuryChainAdapter } from "./infra/treasury-chain.adapter";
import { TreasuryRepository } from "./infra/treasury.repository";

export interface IntentResult {
  intentId: string;
  unsignedXdr: string;
  expiresAt: Date;
}

export interface IntentSubmitResult {
  status: "submitted";
  stellarTxHash: string;
}

@Injectable()
export class TreasuryService {
  constructor(
    private readonly repository: TreasuryRepository,
    private readonly chainAdapter: TreasuryChainAdapter,
    private readonly intents: IntentService,
  ) {}

  private async requireTreasuryAddress(organizationId: string): Promise<string> {
    const address = await this.repository.findTreasuryContractAddress(organizationId);
    if (!address) {
      throw new DomainException("ORGANIZATION_NOT_FOUND", "No such organization.");
    }
    return address;
  }

  /** docs/TREASURY_ARCHITECTURE.md §2-3: live balance + off-chain pending-obligations projection. */
  async getOverview(organizationId: string): Promise<{ balance: string; pendingObligations: string }> {
    const treasuryAddress = await this.requireTreasuryAddress(organizationId);

    const [balance, obligations] = await Promise.all([
      this.chainAdapter.getBalance(treasuryAddress),
      this.repository.sumPendingObligations(organizationId),
    ]);

    const pendingObligations = stroopsToDecimal(
      decimalToStroops(obligations.scheduledPayroll) + decimalToStroops(obligations.escrowedMilestones),
    );

    return { balance, pendingObligations };
  }

  async buildDepositIntent(
    organizationId: string,
    userId: string,
    input: DepositIntentInput,
  ): Promise<IntentResult> {
    const treasuryAddress = await this.requireTreasuryAddress(organizationId);

    const { unsignedXdr } = await this.intents.buildXdrOrThrow(() =>
      this.chainAdapter.buildDepositXdr({
        treasuryContractId: treasuryAddress,
        fromAddress: input.fromAddress,
        amount: input.amount,
      }),
    );

    return this.intents.create({
      organizationId,
      type: "TREASURY_DEPOSIT",
      unsignedXdr,
      createdById: userId,
      metadata: { fromAddress: input.fromAddress, amount: input.amount },
    });
  }

  async buildWithdrawIntent(
    organizationId: string,
    userId: string,
    input: WithdrawIntentInput,
  ): Promise<IntentResult> {
    const treasuryAddress = await this.requireTreasuryAddress(organizationId);

    const { unsignedXdr } = await this.intents.buildXdrOrThrow(() =>
      this.chainAdapter.buildWithdrawXdr({
        treasuryContractId: treasuryAddress,
        callerAddress: input.callerAddress,
        toAddress: input.toAddress,
        amount: input.amount,
      }),
    );

    return this.intents.create({
      organizationId,
      type: "TREASURY_WITHDRAW",
      unsignedXdr,
      createdById: userId,
      metadata: { callerAddress: input.callerAddress, toAddress: input.toAddress, amount: input.amount },
    });
  }

  async submitDepositIntent(
    organizationId: string,
    intentId: string,
    signedXdr: string,
  ): Promise<IntentSubmitResult> {
    return this.intents.submitAndConsume({
      intentId,
      organizationId,
      expectedType: "TREASURY_DEPOSIT",
      signedXdr,
      submit: (xdr) => this.chainAdapter.submitSignedXdr(xdr),
    });
  }

  async submitWithdrawIntent(
    organizationId: string,
    intentId: string,
    signedXdr: string,
  ): Promise<IntentSubmitResult> {
    return this.intents.submitAndConsume({
      intentId,
      organizationId,
      expectedType: "TREASURY_WITHDRAW",
      signedXdr,
      submit: (xdr) => this.chainAdapter.submitSignedXdr(xdr),
    });
  }
}
