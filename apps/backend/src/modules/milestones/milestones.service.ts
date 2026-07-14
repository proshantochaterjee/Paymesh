import { Injectable } from "@nestjs/common";
import type { Milestone, MilestoneStatus } from "@prisma/client";
import { decimalToStroops } from "@workforceos/sdk";
import type { CreateMilestoneInput } from "@workforceos/shared";

import { DomainException } from "../../common/exceptions/domain.exception";
import { IntentService } from "../../common/intent/intent.service";
import { MilestonesChainAdapter } from "./infra/milestones-chain.adapter";
import { MilestonesRepository } from "./infra/milestones.repository";

export interface FundIntentResult {
  intentId: string;
  unsignedXdr: string;
  expiresAt: Date;
  step: "create" | "fund";
}

export interface SubmitFundIntentResult {
  status: "submitted";
  stellarTxHash: string;
  step: "create" | "fund";
}

export interface IntentResult {
  intentId: string;
  unsignedXdr: string;
  expiresAt: Date;
}

export interface IntentSubmitResult {
  status: "submitted";
  stellarTxHash: string;
}

export interface CancelResult {
  milestone: Milestone;
  intentId?: string;
  unsignedXdr?: string;
  expiresAt?: Date;
}

@Injectable()
export class MilestonesService {
  constructor(
    private readonly repository: MilestonesRepository,
    private readonly chainAdapter: MilestonesChainAdapter,
    private readonly intents: IntentService,
  ) {}

  private async requireMilestone(organizationId: string, milestoneId: string): Promise<Milestone> {
    const milestone = await this.repository.findById(organizationId, milestoneId);
    if (!milestone) {
      throw new DomainException("MILESTONE_NOT_FOUND", "No such milestone.");
    }
    return milestone;
  }

  private async requireOnChainOrgId(organizationId: string): Promise<bigint> {
    const onChainOrgId = await this.repository.findOnChainOrgId(organizationId);
    if (onChainOrgId === null) {
      throw new DomainException("ORGANIZATION_NOT_FOUND", "No such organization.");
    }
    return onChainOrgId;
  }

  async list(organizationId: string, filters: { status?: MilestoneStatus }): Promise<Milestone[]> {
    return this.repository.findMany(organizationId, filters);
  }

  async getById(organizationId: string, milestoneId: string): Promise<Milestone> {
    return this.requireMilestone(organizationId, milestoneId);
  }

  /**
   * docs/MILESTONE_ENGINE.md §3: creating a milestone writes only the
   * Postgres row (DRAFT, no `onChainMilestoneId` yet) — no chain call at
   * all until funding, so a title/description can be drafted and edited
   * freely first.
   */
  async create(organizationId: string, input: CreateMilestoneInput, userId: string): Promise<Milestone> {
    const wallet = await this.repository.findContractorWallet(organizationId, input.contractorId);
    if (!wallet) {
      throw new DomainException("CONTRACTOR_NOT_FOUND", "No such contractor.");
    }
    return this.repository.create({
      organizationId,
      contractorId: input.contractorId,
      title: input.title,
      description: input.description,
      amount: input.amount,
      createdById: userId,
    });
  }

  /**
   * docs/MILESTONE_ENGINE.md §3: funding is two on-chain calls
   * (`create_milestone` then `fund_milestone`) that can never be combined
   * into one transaction (Soroban rejects more than one
   * `InvokeHostFunction` operation per transaction — confirmed in Step
   * 10). This always builds the *next* needed step, mirroring Payroll's
   * chunking pattern: call again after submitting to get the next one.
   */
  async buildFundIntent(organizationId: string, callerAddress: string, userId: string, milestoneId: string): Promise<FundIntentResult> {
    const milestone = await this.requireMilestone(organizationId, milestoneId);
    if (milestone.status !== "DRAFT") {
      throw new DomainException("INVALID_STATE_TRANSITION", `Cannot fund a milestone in ${milestone.status} status.`);
    }

    const onChainOrgId = await this.requireOnChainOrgId(organizationId);

    if (milestone.onChainMilestoneId === null) {
      const contractorWallet = await this.repository.findContractorWallet(organizationId, milestone.contractorId);
      if (!contractorWallet) {
        throw new DomainException("CONTRACTOR_NOT_FOUND", "No such contractor.");
      }
      const { unsignedXdr } = await this.intents.buildXdrOrThrow(() =>
        this.chainAdapter.buildCreateXdr({
          callerAddress,
          onChainOrgId,
          contractorAddress: contractorWallet,
          amountStroops: decimalToStroops(milestone.amount.toString()),
        }),
      );
      const intent = await this.intents.create({
        organizationId,
        type: "MILESTONE_CREATE",
        unsignedXdr,
        createdById: userId,
        metadata: { milestoneId },
      });
      return { ...intent, step: "create" };
    }

    const { unsignedXdr } = await this.intents.buildXdrOrThrow(() =>
      this.chainAdapter.buildFundXdr({ callerAddress, onChainOrgId, onChainMilestoneId: milestone.onChainMilestoneId! }),
    );
    const intent = await this.intents.create({
      organizationId,
      type: "MILESTONE_FUND",
      unsignedXdr,
      createdById: userId,
      metadata: { milestoneId },
    });
    return { ...intent, step: "fund" };
  }

  async submitFundIntent(
    organizationId: string,
    milestoneId: string,
    intentId: string,
    signedXdr: string,
  ): Promise<SubmitFundIntentResult> {
    const intent = await this.intents.validateForSubmit(intentId, organizationId, ["MILESTONE_CREATE", "MILESTONE_FUND"]);
    const metadata = intent.metadata as { milestoneId: string } | null;
    if (!metadata || metadata.milestoneId !== milestoneId) {
      throw new DomainException("INTENT_EXPIRED", "This intent does not exist or has expired.");
    }

    if (intent.type === "MILESTONE_CREATE") {
      const result = await this.intents.submitAndConsume({
        intentId,
        organizationId,
        expectedType: "MILESTONE_CREATE",
        signedXdr,
        submit: (xdr) => this.chainAdapter.submitSignedXdr(xdr),
      });
      const onChainMilestoneId = await this.chainAdapter.waitForCreatedMilestoneId(result.stellarTxHash);
      if (onChainMilestoneId !== null) {
        await this.repository.backfillOnChainMilestoneId(milestoneId, onChainMilestoneId);
      }
      return { ...result, step: "create" };
    }

    const result = await this.intents.submitAndConsume({
      intentId,
      organizationId,
      expectedType: "MILESTONE_FUND",
      signedXdr,
      submit: (xdr) => this.chainAdapter.submitSignedXdr(xdr),
    });
    if (await this.chainAdapter.waitForConfirmedSuccess(result.stellarTxHash)) {
      await this.repository.updateStatus(milestoneId, "FUNDED", result.stellarTxHash);
    }
    return { ...result, step: "fund" };
  }

  async buildApproveIntent(organizationId: string, callerAddress: string, userId: string, milestoneId: string): Promise<IntentResult> {
    const milestone = await this.requireMilestone(organizationId, milestoneId);
    if (milestone.status !== "FUNDED") {
      throw new DomainException("INVALID_STATE_TRANSITION", `Cannot approve a milestone in ${milestone.status} status.`);
    }
    return this.buildSingleCallIntent(organizationId, callerAddress, userId, milestone, "MILESTONE_APPROVE", (p) =>
      this.chainAdapter.buildApproveXdr(p),
    );
  }

  async submitApproveIntent(organizationId: string, milestoneId: string, intentId: string, signedXdr: string): Promise<IntentSubmitResult> {
    const result = await this.intents.submitAndConsume({
      intentId,
      organizationId,
      expectedType: "MILESTONE_APPROVE",
      signedXdr,
      submit: (xdr) => this.chainAdapter.submitSignedXdr(xdr),
    });
    if (await this.chainAdapter.waitForConfirmedSuccess(result.stellarTxHash)) {
      await this.repository.updateStatus(milestoneId, "APPROVED", result.stellarTxHash);
    }
    return result;
  }

  async buildReleaseIntent(organizationId: string, callerAddress: string, userId: string, milestoneId: string): Promise<IntentResult> {
    const milestone = await this.requireMilestone(organizationId, milestoneId);
    if (milestone.status !== "APPROVED") {
      throw new DomainException("INVALID_STATE_TRANSITION", `Cannot release a milestone in ${milestone.status} status.`);
    }
    return this.buildSingleCallIntent(organizationId, callerAddress, userId, milestone, "MILESTONE_RELEASE", (p) =>
      this.chainAdapter.buildReleaseXdr(p),
    );
  }

  async submitReleaseIntent(organizationId: string, milestoneId: string, intentId: string, signedXdr: string): Promise<IntentSubmitResult> {
    const result = await this.intents.submitAndConsume({
      intentId,
      organizationId,
      expectedType: "MILESTONE_RELEASE",
      signedXdr,
      submit: (xdr) => this.chainAdapter.submitSignedXdr(xdr),
    });
    if (await this.chainAdapter.waitForConfirmedSuccess(result.stellarTxHash)) {
      await this.repository.updateStatus(milestoneId, "RELEASED", result.stellarTxHash);
    }
    return result;
  }

  /**
   * docs/MILESTONE_ENGINE.md §2: cancel is valid from DRAFT (no-op
   * refund) or FUNDED (refunds escrow) — rejected from APPROVED/RELEASED.
   * If nothing was ever `create_milestone`'d on-chain
   * (`onChainMilestoneId` still null), there's nothing on-chain to
   * cancel — Postgres-only, same pattern as Employees' deactivate on a
   * still-pending registration.
   */
  async cancel(organizationId: string, callerAddress: string, userId: string, milestoneId: string): Promise<CancelResult> {
    const milestone = await this.requireMilestone(organizationId, milestoneId);
    if (milestone.status !== "DRAFT" && milestone.status !== "FUNDED") {
      throw new DomainException("INVALID_STATE_TRANSITION", `Cannot cancel a milestone in ${milestone.status} status.`);
    }

    if (milestone.onChainMilestoneId === null) {
      await this.repository.updateStatus(milestoneId, "CANCELLED");
      return { milestone: { ...milestone, status: "CANCELLED" } };
    }

    const intent = await this.buildSingleCallIntent(organizationId, callerAddress, userId, milestone, "MILESTONE_CANCEL", (p) =>
      this.chainAdapter.buildCancelXdr(p),
    );
    return { milestone, ...intent };
  }

  async submitCancelIntent(organizationId: string, milestoneId: string, intentId: string, signedXdr: string): Promise<IntentSubmitResult> {
    const result = await this.intents.submitAndConsume({
      intentId,
      organizationId,
      expectedType: "MILESTONE_CANCEL",
      signedXdr,
      submit: (xdr) => this.chainAdapter.submitSignedXdr(xdr),
    });
    if (await this.chainAdapter.waitForConfirmedSuccess(result.stellarTxHash)) {
      await this.repository.updateStatus(milestoneId, "CANCELLED", result.stellarTxHash);
    }
    return result;
  }

  private async buildSingleCallIntent(
    organizationId: string,
    callerAddress: string,
    userId: string,
    milestone: Milestone,
    type: "MILESTONE_APPROVE" | "MILESTONE_RELEASE" | "MILESTONE_CANCEL",
    build: (params: { callerAddress: string; onChainOrgId: bigint; onChainMilestoneId: bigint }) => Promise<{ unsignedXdr: string }>,
  ): Promise<IntentResult> {
    const onChainOrgId = await this.requireOnChainOrgId(organizationId);
    const { unsignedXdr } = await this.intents.buildXdrOrThrow(() =>
      build({ callerAddress, onChainOrgId, onChainMilestoneId: milestone.onChainMilestoneId! }),
    );
    return this.intents.create({
      organizationId,
      type,
      unsignedXdr,
      createdById: userId,
      metadata: { milestoneId: milestone.id },
    });
  }
}
