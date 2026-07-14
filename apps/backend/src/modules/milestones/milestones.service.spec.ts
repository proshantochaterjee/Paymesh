import { SimulationFailedError } from "@workforceos/sdk";
import { describe, expect, it, vi } from "vitest";

import { DomainException } from "../../common/exceptions/domain.exception";
import { IntentService } from "../../common/intent/intent.service";
import { MilestonesService } from "./milestones.service";

function createMocks() {
  const repository = {
    findOnChainOrgId: vi.fn(),
    findContractorWallet: vi.fn(),
    findMany: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    backfillOnChainMilestoneId: vi.fn(),
    updateStatus: vi.fn(),
  };
  const chainAdapter = {
    buildCreateXdr: vi.fn(),
    buildFundXdr: vi.fn(),
    buildApproveXdr: vi.fn(),
    buildReleaseXdr: vi.fn(),
    buildCancelXdr: vi.fn(),
    submitSignedXdr: vi.fn(),
    waitForCreatedMilestoneId: vi.fn(),
    waitForConfirmedSuccess: vi.fn(),
  };
  const intentRepository = { create: vi.fn(), findById: vi.fn(), markConsumed: vi.fn() };
  const intents = new IntentService(intentRepository as never);
  const service = new MilestonesService(repository as never, chainAdapter as never, intents);
  return { service, repository, chainAdapter, intentRepository };
}

describe("MilestonesService", () => {
  describe("create", () => {
    it("throws CONTRACTOR_NOT_FOUND when the contractor doesn't exist", async () => {
      const { service, repository } = createMocks();
      repository.findContractorWallet.mockResolvedValue(null);

      await expect(
        service.create("org1", { contractorId: "c1", title: "T", amount: "100" }, "user1"),
      ).rejects.toMatchObject({ code: "CONTRACTOR_NOT_FOUND" } satisfies Partial<DomainException>);
    });

    it("writes only the Postgres row, no chain call", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.findContractorWallet.mockResolvedValue("GCONTRACTOR");
      repository.create.mockResolvedValue({ id: "m1", status: "DRAFT" });

      await service.create("org1", { contractorId: "c1", title: "T", amount: "100" }, "user1");

      expect(chainAdapter.buildCreateXdr).not.toHaveBeenCalled();
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org1", contractorId: "c1", title: "T", amount: "100" }),
      );
    });
  });

  describe("buildFundIntent", () => {
    it("throws INVALID_STATE_TRANSITION when the milestone isn't DRAFT", async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue({ id: "m1", status: "FUNDED", onChainMilestoneId: 1n });

      await expect(service.buildFundIntent("org1", "GFINANCE", "user1", "m1")).rejects.toMatchObject({
        code: "INVALID_STATE_TRANSITION",
      } satisfies Partial<DomainException>);
    });

    it("builds the create step when onChainMilestoneId is still null", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      repository.findById.mockResolvedValue({ id: "m1", status: "DRAFT", onChainMilestoneId: null, contractorId: "c1", amount: { toString: () => "100" } });
      repository.findOnChainOrgId.mockResolvedValue(1n);
      repository.findContractorWallet.mockResolvedValue("GCONTRACTOR");
      chainAdapter.buildCreateXdr.mockResolvedValue({ unsignedXdr: "UNSIGNED" });
      intentRepository.create.mockResolvedValue({ id: "intent1" });

      const result = await service.buildFundIntent("org1", "GFINANCE", "user1", "m1");

      expect(chainAdapter.buildCreateXdr).toHaveBeenCalledWith(
        expect.objectContaining({ callerAddress: "GFINANCE", onChainOrgId: 1n, contractorAddress: "GCONTRACTOR" }),
      );
      expect(intentRepository.create).toHaveBeenCalledWith(expect.objectContaining({ type: "MILESTONE_CREATE" }));
      expect(result.step).toBe("create");
    });

    it("builds the fund step when onChainMilestoneId is already set", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      repository.findById.mockResolvedValue({ id: "m1", status: "DRAFT", onChainMilestoneId: 5n, contractorId: "c1", amount: { toString: () => "100" } });
      repository.findOnChainOrgId.mockResolvedValue(1n);
      chainAdapter.buildFundXdr.mockResolvedValue({ unsignedXdr: "UNSIGNED" });
      intentRepository.create.mockResolvedValue({ id: "intent2" });

      const result = await service.buildFundIntent("org1", "GFINANCE", "user1", "m1");

      expect(chainAdapter.buildFundXdr).toHaveBeenCalledWith(
        expect.objectContaining({ callerAddress: "GFINANCE", onChainOrgId: 1n, onChainMilestoneId: 5n }),
      );
      expect(intentRepository.create).toHaveBeenCalledWith(expect.objectContaining({ type: "MILESTONE_FUND" }));
      expect(result.step).toBe("fund");
    });

    it("maps a SimulationFailedError to SIMULATION_FAILED", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.findById.mockResolvedValue({ id: "m1", status: "DRAFT", onChainMilestoneId: 5n, contractorId: "c1", amount: { toString: () => "100" } });
      repository.findOnChainOrgId.mockResolvedValue(1n);
      chainAdapter.buildFundXdr.mockRejectedValue(new SimulationFailedError("boom"));

      await expect(service.buildFundIntent("org1", "GFINANCE", "user1", "m1")).rejects.toMatchObject({
        code: "SIMULATION_FAILED",
      } satisfies Partial<DomainException>);
    });
  });

  describe("submitFundIntent", () => {
    it("dispatches the create step: backfills onChainMilestoneId when confirmed, does not touch status", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: "org1",
        type: "MILESTONE_CREATE",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        metadata: { milestoneId: "m1" },
      });
      chainAdapter.submitSignedXdr.mockResolvedValue({ stellarTxHash: "abc", status: "PENDING" });
      chainAdapter.waitForCreatedMilestoneId.mockResolvedValue(7n);

      const result = await service.submitFundIntent("org1", "m1", "intent1", "SIGNED");

      expect(repository.backfillOnChainMilestoneId).toHaveBeenCalledWith("m1", 7n);
      expect(repository.updateStatus).not.toHaveBeenCalled();
      expect(result.step).toBe("create");
    });

    it("dispatches the fund step: marks FUNDED only when the transaction actually confirmed", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue({
        id: "intent2",
        organizationId: "org1",
        type: "MILESTONE_FUND",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        metadata: { milestoneId: "m1" },
      });
      chainAdapter.submitSignedXdr.mockResolvedValue({ stellarTxHash: "abc", status: "PENDING" });
      chainAdapter.waitForConfirmedSuccess.mockResolvedValue(true);

      const result = await service.submitFundIntent("org1", "m1", "intent2", "SIGNED");

      expect(repository.updateStatus).toHaveBeenCalledWith("m1", "FUNDED", "abc");
      expect(result.step).toBe("fund");
    });

    it("does not mark FUNDED when confirmation never resolved (found via real e2e testing — a chained approve could otherwise race stale on-chain state)", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue({
        id: "intent2",
        organizationId: "org1",
        type: "MILESTONE_FUND",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        metadata: { milestoneId: "m1" },
      });
      chainAdapter.submitSignedXdr.mockResolvedValue({ stellarTxHash: "abc", status: "PENDING" });
      chainAdapter.waitForConfirmedSuccess.mockResolvedValue(false);

      await service.submitFundIntent("org1", "m1", "intent2", "SIGNED");

      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it("throws INTENT_EXPIRED when the intent's milestoneId doesn't match the URL's milestoneId", async () => {
      const { service, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: "org1",
        type: "MILESTONE_CREATE",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        metadata: { milestoneId: "other-milestone" },
      });

      await expect(service.submitFundIntent("org1", "m1", "intent1", "SIGNED")).rejects.toMatchObject({
        code: "INTENT_EXPIRED",
      } satisfies Partial<DomainException>);
    });
  });

  describe("buildApproveIntent / submitApproveIntent", () => {
    it("throws INVALID_STATE_TRANSITION when the milestone isn't FUNDED", async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue({ id: "m1", status: "DRAFT" });

      await expect(service.buildApproveIntent("org1", "GFINANCE", "user1", "m1")).rejects.toMatchObject({
        code: "INVALID_STATE_TRANSITION",
      } satisfies Partial<DomainException>);
    });

    it("marks APPROVED only when confirmed", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: "org1",
        type: "MILESTONE_APPROVE",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      chainAdapter.submitSignedXdr.mockResolvedValue({ stellarTxHash: "abc", status: "PENDING" });
      chainAdapter.waitForConfirmedSuccess.mockResolvedValue(true);

      await service.submitApproveIntent("org1", "m1", "intent1", "SIGNED");

      expect(repository.updateStatus).toHaveBeenCalledWith("m1", "APPROVED", "abc");
    });
  });

  describe("buildReleaseIntent / submitReleaseIntent", () => {
    it("throws INVALID_STATE_TRANSITION when the milestone isn't APPROVED", async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue({ id: "m1", status: "FUNDED" });

      await expect(service.buildReleaseIntent("org1", "GFINANCE", "user1", "m1")).rejects.toMatchObject({
        code: "INVALID_STATE_TRANSITION",
      } satisfies Partial<DomainException>);
    });

    it("marks RELEASED only when confirmed", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: "org1",
        type: "MILESTONE_RELEASE",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      chainAdapter.submitSignedXdr.mockResolvedValue({ stellarTxHash: "abc", status: "PENDING" });
      chainAdapter.waitForConfirmedSuccess.mockResolvedValue(true);

      await service.submitReleaseIntent("org1", "m1", "intent1", "SIGNED");

      expect(repository.updateStatus).toHaveBeenCalledWith("m1", "RELEASED", "abc");
    });
  });

  describe("cancel", () => {
    it("throws INVALID_STATE_TRANSITION when the milestone is APPROVED or RELEASED", async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue({ id: "m1", status: "APPROVED" });

      await expect(service.cancel("org1", "GFINANCE", "user1", "m1")).rejects.toMatchObject({
        code: "INVALID_STATE_TRANSITION",
      } satisfies Partial<DomainException>);
    });

    it("cancels Postgres-only with no intent when nothing was ever created on-chain", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.findById.mockResolvedValue({ id: "m1", status: "DRAFT", onChainMilestoneId: null });
      repository.updateStatus.mockResolvedValue(undefined);

      const result = await service.cancel("org1", "GFINANCE", "user1", "m1");

      expect(chainAdapter.buildCancelXdr).not.toHaveBeenCalled();
      expect(repository.updateStatus).toHaveBeenCalledWith("m1", "CANCELLED");
      expect(result.intentId).toBeUndefined();
      expect(result.milestone.status).toBe("CANCELLED");
    });

    it("builds an on-chain cancel-intent when the milestone was created on-chain (e.g. FUNDED)", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      repository.findById.mockResolvedValue({ id: "m1", status: "FUNDED", onChainMilestoneId: 5n });
      repository.findOnChainOrgId.mockResolvedValue(1n);
      chainAdapter.buildCancelXdr.mockResolvedValue({ unsignedXdr: "UNSIGNED" });
      intentRepository.create.mockResolvedValue({ id: "intent1" });

      const result = await service.cancel("org1", "GFINANCE", "user1", "m1");

      expect(chainAdapter.buildCancelXdr).toHaveBeenCalledWith(
        expect.objectContaining({ onChainOrgId: 1n, onChainMilestoneId: 5n }),
      );
      expect(repository.updateStatus).not.toHaveBeenCalled();
      expect(result.intentId).toBe("intent1");
    });
  });

  describe("submitCancelIntent", () => {
    it("marks CANCELLED only when confirmed", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: "org1",
        type: "MILESTONE_CANCEL",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      chainAdapter.submitSignedXdr.mockResolvedValue({ stellarTxHash: "abc", status: "PENDING" });
      chainAdapter.waitForConfirmedSuccess.mockResolvedValue(true);

      await service.submitCancelIntent("org1", "m1", "intent1", "SIGNED");

      expect(repository.updateStatus).toHaveBeenCalledWith("m1", "CANCELLED", "abc");
    });
  });
});
