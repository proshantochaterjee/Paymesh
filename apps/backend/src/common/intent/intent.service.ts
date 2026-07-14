import { Injectable } from "@nestjs/common";
import type { Intent, IntentType } from "@prisma/client";
import { SimulationFailedError } from "@workforceos/sdk";
import { INTENT_EXPIRY_MINUTES } from "@workforceos/shared";

import { DomainException } from "../exceptions/domain.exception";
import { IntentRepository } from "./intent.repository";

@Injectable()
export class IntentService {
  constructor(private readonly repository: IntentRepository) {}

  async create(params: {
    organizationId: string | null;
    type: IntentType;
    unsignedXdr: string;
    createdById: string;
    metadata: Record<string, string>;
  }): Promise<{ intentId: string; unsignedXdr: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + INTENT_EXPIRY_MINUTES * 60 * 1000);
    const intent = await this.repository.create({ ...params, expiresAt });
    return { intentId: intent.id, unsignedXdr: params.unsignedXdr, expiresAt };
  }

  /**
   * docs/API_SPECIFICATION.md: not-found, wrong-org, and wrong-type are
   * all reported identically as `410 INTENT_EXPIRED` so a guessed
   * `intentId` can't distinguish "doesn't exist" from "exists in another
   * organization." `expectedType` accepts a list for the rare case where
   * one submit endpoint legitimately fronts more than one intent type —
   * e.g. Milestones' `fund-intent/:intentId/submit` submits either a
   * `MILESTONE_CREATE` or a `MILESTONE_FUND` intent, since funding is two
   * on-chain calls the caller steps through via the same endpoint
   * (docs/MILESTONE_ENGINE.md §3).
   */
  async validateForSubmit(
    intentId: string,
    organizationId: string | null,
    expectedType: IntentType | IntentType[],
  ): Promise<Intent> {
    const intent = await this.repository.findById(intentId);
    const allowedTypes = Array.isArray(expectedType) ? expectedType : [expectedType];

    if (!intent || intent.organizationId !== organizationId || !allowedTypes.includes(intent.type)) {
      throw new DomainException("INTENT_EXPIRED", "This intent does not exist or has expired.");
    }
    if (intent.consumedAt) {
      throw new DomainException("INTENT_ALREADY_SUBMITTED", "This intent has already been submitted.");
    }
    if (intent.expiresAt.getTime() < Date.now()) {
      throw new DomainException("INTENT_EXPIRED", "This intent has expired — build a new one.");
    }

    return intent;
  }

  async markConsumed(intentId: string): Promise<void> {
    await this.repository.markConsumed(intentId);
  }

  /**
   * The full submit-side flow shared by every intent-backed action:
   * validate, submit to chain (mapping a chain failure to
   * `502 CHAIN_SUBMISSION_FAILED`), mark consumed only on success.
   */
  async submitAndConsume(params: {
    intentId: string;
    organizationId: string | null;
    expectedType: IntentType | IntentType[];
    signedXdr: string;
    submit: (signedXdr: string) => Promise<{ stellarTxHash: string; status: string }>;
  }): Promise<{ status: "submitted"; stellarTxHash: string }> {
    await this.validateForSubmit(params.intentId, params.organizationId, params.expectedType);

    let result: { stellarTxHash: string; status: string };
    try {
      result = await params.submit(params.signedXdr);
    } catch (error) {
      throw new DomainException(
        "CHAIN_SUBMISSION_FAILED",
        error instanceof Error ? error.message : "Failed to submit transaction to the Stellar network.",
      );
    }

    await this.markConsumed(params.intentId);
    return { status: "submitted", stellarTxHash: result.stellarTxHash };
  }

  /**
   * `AssembledTransaction`'s simulation can fail on a genuine on-chain
   * precondition (missing trustline, insufficient balance, unauthorized
   * caller) — caught here rather than handing the caller an unsigned XDR
   * that's doomed to fail at submit time (`502 SIMULATION_FAILED`, the
   * same category as `CHAIN_SUBMISSION_FAILED` but for the build step).
   */
  async buildXdrOrThrow(build: () => Promise<{ unsignedXdr: string }>): Promise<{ unsignedXdr: string }> {
    try {
      return await build();
    } catch (error) {
      if (error instanceof SimulationFailedError) {
        throw new DomainException("SIMULATION_FAILED", error.message);
      }
      throw error;
    }
  }
}
