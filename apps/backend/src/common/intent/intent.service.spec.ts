import { SimulationFailedError } from "@workforceos/sdk";
import { describe, expect, it, vi } from "vitest";

import { DomainException } from "../exceptions/domain.exception";
import { IntentService } from "./intent.service";

function createService() {
  const repository = {
    create: vi.fn(),
    findById: vi.fn(),
    markConsumed: vi.fn(),
  };
  const service = new IntentService(repository as never);
  return { service, repository };
}

describe("IntentService", () => {
  describe("create", () => {
    it("persists via the repository and returns intentId/unsignedXdr/expiresAt", async () => {
      const { service, repository } = createService();
      repository.create.mockResolvedValue({ id: "intent1" });

      const result = await service.create({
        organizationId: "org1",
        type: "TREASURY_DEPOSIT",
        unsignedXdr: "UNSIGNED",
        createdById: "user1",
        metadata: { amount: "10" },
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org1", type: "TREASURY_DEPOSIT", unsignedXdr: "UNSIGNED" }),
      );
      expect(result.intentId).toBe("intent1");
      expect(result.unsignedXdr).toBe("UNSIGNED");
      expect(result.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe("validateForSubmit", () => {
    it("throws INTENT_EXPIRED when the intent doesn't exist", async () => {
      const { service, repository } = createService();
      repository.findById.mockResolvedValue(null);

      await expect(service.validateForSubmit("intent1", "org1", "TREASURY_DEPOSIT")).rejects.toMatchObject({
        code: "INTENT_EXPIRED",
      } satisfies Partial<DomainException>);
    });

    it("throws INTENT_EXPIRED when the intent belongs to a different organization", async () => {
      const { service, repository } = createService();
      repository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: "other-org",
        type: "TREASURY_DEPOSIT",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.validateForSubmit("intent1", "org1", "TREASURY_DEPOSIT")).rejects.toMatchObject({
        code: "INTENT_EXPIRED",
      } satisfies Partial<DomainException>);
    });

    it("throws INTENT_EXPIRED when the intent type doesn't match what the caller expects", async () => {
      const { service, repository } = createService();
      repository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: "org1",
        type: "TREASURY_WITHDRAW",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.validateForSubmit("intent1", "org1", "TREASURY_DEPOSIT")).rejects.toMatchObject({
        code: "INTENT_EXPIRED",
      } satisfies Partial<DomainException>);
    });

    it("throws INTENT_ALREADY_SUBMITTED when already consumed (replay protection)", async () => {
      const { service, repository } = createService();
      repository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: "org1",
        type: "TREASURY_DEPOSIT",
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.validateForSubmit("intent1", "org1", "TREASURY_DEPOSIT")).rejects.toMatchObject({
        code: "INTENT_ALREADY_SUBMITTED",
      } satisfies Partial<DomainException>);
    });

    it("throws INTENT_EXPIRED when past its expiresAt", async () => {
      const { service, repository } = createService();
      repository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: "org1",
        type: "TREASURY_DEPOSIT",
        consumedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.validateForSubmit("intent1", "org1", "TREASURY_DEPOSIT")).rejects.toMatchObject({
        code: "INTENT_EXPIRED",
      } satisfies Partial<DomainException>);
    });

    it("returns the intent when valid", async () => {
      const { service, repository } = createService();
      const intent = {
        id: "intent1",
        organizationId: "org1",
        type: "TREASURY_DEPOSIT",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      };
      repository.findById.mockResolvedValue(intent);

      await expect(service.validateForSubmit("intent1", "org1", "TREASURY_DEPOSIT")).resolves.toEqual(intent);
    });

    it("accepts a list of expected types (one submit endpoint fronting more than one intent type)", async () => {
      const { service, repository } = createService();
      const intent = {
        id: "intent1",
        organizationId: "org1",
        type: "MILESTONE_FUND",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      };
      repository.findById.mockResolvedValue(intent);

      await expect(
        service.validateForSubmit("intent1", "org1", ["MILESTONE_CREATE", "MILESTONE_FUND"]),
      ).resolves.toEqual(intent);
    });

    it("rejects a type not present in the expected-types list", async () => {
      const { service, repository } = createService();
      repository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: "org1",
        type: "MILESTONE_APPROVE",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.validateForSubmit("intent1", "org1", ["MILESTONE_CREATE", "MILESTONE_FUND"]),
      ).rejects.toMatchObject({ code: "INTENT_EXPIRED" } satisfies Partial<DomainException>);
    });
  });

  describe("submitAndConsume", () => {
    it("submits, marks consumed, and returns the tx hash on the happy path", async () => {
      const { service, repository } = createService();
      repository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: "org1",
        type: "TREASURY_DEPOSIT",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const submit = vi.fn().mockResolvedValue({ stellarTxHash: "abc123", status: "PENDING" });

      const result = await service.submitAndConsume({
        intentId: "intent1",
        organizationId: "org1",
        expectedType: "TREASURY_DEPOSIT",
        signedXdr: "SIGNED",
        submit,
      });

      expect(submit).toHaveBeenCalledWith("SIGNED");
      expect(repository.markConsumed).toHaveBeenCalledWith("intent1");
      expect(result).toEqual({ status: "submitted", stellarTxHash: "abc123" });
    });

    it("maps a chain submission failure to CHAIN_SUBMISSION_FAILED and does not mark consumed", async () => {
      const { service, repository } = createService();
      repository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: "org1",
        type: "TREASURY_DEPOSIT",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const submit = vi.fn().mockRejectedValue(new Error("network down"));

      await expect(
        service.submitAndConsume({
          intentId: "intent1",
          organizationId: "org1",
          expectedType: "TREASURY_DEPOSIT",
          signedXdr: "SIGNED",
          submit,
        }),
      ).rejects.toMatchObject({ code: "CHAIN_SUBMISSION_FAILED" } satisfies Partial<DomainException>);
      expect(repository.markConsumed).not.toHaveBeenCalled();
    });

    it("does not call submit at all when validation fails", async () => {
      const { service, repository } = createService();
      repository.findById.mockResolvedValue(null);
      const submit = vi.fn();

      await expect(
        service.submitAndConsume({
          intentId: "intent1",
          organizationId: "org1",
          expectedType: "TREASURY_DEPOSIT",
          signedXdr: "SIGNED",
          submit,
        }),
      ).rejects.toMatchObject({ code: "INTENT_EXPIRED" } satisfies Partial<DomainException>);
      expect(submit).not.toHaveBeenCalled();
    });
  });

  describe("buildXdrOrThrow", () => {
    it("returns the built XDR on success", async () => {
      const { service } = createService();
      await expect(service.buildXdrOrThrow(async () => ({ unsignedXdr: "XDR" }))).resolves.toEqual({
        unsignedXdr: "XDR",
      });
    });

    it("maps a SimulationFailedError to SIMULATION_FAILED", async () => {
      const { service } = createService();
      await expect(
        service.buildXdrOrThrow(async () => {
          throw new SimulationFailedError("trustline missing");
        }),
      ).rejects.toMatchObject({ code: "SIMULATION_FAILED" } satisfies Partial<DomainException>);
    });

    it("rethrows any other error unchanged", async () => {
      const { service } = createService();
      await expect(
        service.buildXdrOrThrow(async () => {
          throw new Error("something else");
        }),
      ).rejects.toThrow("something else");
    });
  });
});
