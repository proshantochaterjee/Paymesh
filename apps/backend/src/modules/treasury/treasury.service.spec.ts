import { SimulationFailedError } from "@workforceos/sdk";
import { describe, expect, it, vi } from "vitest";

import { DomainException } from "../../common/exceptions/domain.exception";
import { IntentService } from "../../common/intent/intent.service";
import { TreasuryService } from "./treasury.service";

// IntentService's own generic lifecycle (validation, replay protection,
// error mapping) is tested in common/intent/intent.service.spec.ts — here
// it's real (backed by a mocked IntentRepository), so these tests focus
// on what's actually treasury-specific: address resolution, XDR-building
// call shape, and the pending-obligations math.
function createMocks() {
  const repository = {
    findTreasuryContractAddress: vi.fn(),
    sumPendingObligations: vi.fn(),
  };
  const chainAdapter = {
    buildDepositXdr: vi.fn(),
    buildWithdrawXdr: vi.fn(),
    submitSignedXdr: vi.fn(),
    getBalance: vi.fn(),
  };
  const intentRepository = { create: vi.fn(), findById: vi.fn(), markConsumed: vi.fn() };
  const intents = new IntentService(intentRepository as never);
  const service = new TreasuryService(repository as never, chainAdapter as never, intents);
  return { service, repository, chainAdapter, intentRepository };
}

describe("TreasuryService", () => {
  describe("getOverview", () => {
    it("throws ORGANIZATION_NOT_FOUND when the org has no treasury address on file", async () => {
      const { service, repository } = createMocks();
      repository.findTreasuryContractAddress.mockResolvedValue(null);

      await expect(service.getOverview("org1")).rejects.toMatchObject({
        code: "ORGANIZATION_NOT_FOUND",
      } satisfies Partial<DomainException>);
    });

    it("returns live balance plus the sum of scheduled payroll + escrowed milestone obligations", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.findTreasuryContractAddress.mockResolvedValue("CTREASURY");
      chainAdapter.getBalance.mockResolvedValue("100");
      repository.sumPendingObligations.mockResolvedValue({ scheduledPayroll: "30", escrowedMilestones: "5.5" });

      await expect(service.getOverview("org1")).resolves.toEqual({
        balance: "100",
        pendingObligations: "35.5",
      });
    });

    it("returns 0 pending obligations when nothing is scheduled/escrowed yet (expected pre-Step-11/12 state)", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.findTreasuryContractAddress.mockResolvedValue("CTREASURY");
      chainAdapter.getBalance.mockResolvedValue("0");
      repository.sumPendingObligations.mockResolvedValue({ scheduledPayroll: "0", escrowedMilestones: "0" });

      await expect(service.getOverview("org1")).resolves.toEqual({ balance: "0", pendingObligations: "0" });
    });
  });

  describe("buildDepositIntent", () => {
    it("builds XDR against the org's treasury address and persists an Intent", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      repository.findTreasuryContractAddress.mockResolvedValue("CTREASURY");
      chainAdapter.buildDepositXdr.mockResolvedValue({ unsignedXdr: "UNSIGNED_XDR" });
      intentRepository.create.mockResolvedValue({ id: "intent1" });

      const result = await service.buildDepositIntent("org1", "user1", { fromAddress: "GDEP", amount: "10" });

      expect(chainAdapter.buildDepositXdr).toHaveBeenCalledWith({
        treasuryContractId: "CTREASURY",
        fromAddress: "GDEP",
        amount: "10",
      });
      expect(intentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org1", type: "TREASURY_DEPOSIT", createdById: "user1" }),
      );
      expect(result.intentId).toBe("intent1");
      expect(result.unsignedXdr).toBe("UNSIGNED_XDR");
    });

    it("maps a SimulationFailedError to 502 SIMULATION_FAILED instead of returning a doomed-to-fail XDR", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      repository.findTreasuryContractAddress.mockResolvedValue("CTREASURY");
      chainAdapter.buildDepositXdr.mockRejectedValue(new SimulationFailedError("trustline missing"));

      await expect(
        service.buildDepositIntent("org1", "user1", { fromAddress: "GDEP", amount: "10" }),
      ).rejects.toMatchObject({ code: "SIMULATION_FAILED" } satisfies Partial<DomainException>);
      expect(intentRepository.create).not.toHaveBeenCalled();
    });
  });

  describe("buildWithdrawIntent", () => {
    it("builds XDR against the org's treasury address and persists an Intent with withdraw metadata", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      repository.findTreasuryContractAddress.mockResolvedValue("CTREASURY");
      chainAdapter.buildWithdrawXdr.mockResolvedValue({ unsignedXdr: "UNSIGNED_XDR" });
      intentRepository.create.mockResolvedValue({ id: "intent2" });

      const result = await service.buildWithdrawIntent("org1", "user1", {
        callerAddress: "GADMIN",
        toAddress: "GDEST",
        amount: "5",
      });

      expect(chainAdapter.buildWithdrawXdr).toHaveBeenCalledWith({
        treasuryContractId: "CTREASURY",
        callerAddress: "GADMIN",
        toAddress: "GDEST",
        amount: "5",
      });
      expect(intentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: "TREASURY_WITHDRAW" }),
      );
      expect(result.intentId).toBe("intent2");
    });
  });

  describe("submitDepositIntent / submitWithdrawIntent", () => {
    it("delegates to IntentService.submitAndConsume with the treasury chain adapter's submit function", async () => {
      const { service, chainAdapter, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: "org1",
        type: "TREASURY_WITHDRAW",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      chainAdapter.submitSignedXdr.mockResolvedValue({ stellarTxHash: "abc123", status: "PENDING" });

      const result = await service.submitWithdrawIntent("org1", "intent1", "SIGNED_XDR");

      expect(chainAdapter.submitSignedXdr).toHaveBeenCalledWith("SIGNED_XDR");
      expect(intentRepository.markConsumed).toHaveBeenCalledWith("intent1");
      expect(result).toEqual({ status: "submitted", stellarTxHash: "abc123" });
    });

    it("rejects submitting a deposit-intent against a withdraw's intentId (type mismatch)", async () => {
      const { service, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: "org1",
        type: "TREASURY_WITHDRAW",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.submitDepositIntent("org1", "intent1", "SIGNED")).rejects.toMatchObject({
        code: "INTENT_EXPIRED",
      } satisfies Partial<DomainException>);
    });
  });
});
