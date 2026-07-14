import { SimulationFailedError } from "@workforceos/sdk";
import { describe, expect, it, vi } from "vitest";

import { DomainException } from "../../common/exceptions/domain.exception";
import { IntentService } from "../../common/intent/intent.service";
import { EmployeesService } from "./employees.service";

// IntentService's own generic lifecycle is tested in
// common/intent/intent.service.spec.ts — here it's real (backed by a
// mocked IntentRepository), so these tests focus on what's actually
// employees-specific: org/employee resolution, the on-chain-vs-Postgres-only
// branching in update/deactivate, and XDR-building call shape.
function createMocks() {
  const repository = {
    findOnChainOrgId: vi.fn(),
    findMany: vi.fn(),
    findById: vi.fn(),
    findActiveByEmail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    backfillOnChainEmployeeId: vi.fn(),
    findOrCreateDepartment: vi.fn(),
  };
  const chainAdapter = {
    buildRegisterXdr: vi.fn(),
    buildUpdateXdr: vi.fn(),
    buildDeactivateXdr: vi.fn(),
    submitSignedXdr: vi.fn(),
    waitForRegisteredEmployeeId: vi.fn(),
  };
  const intentRepository = { create: vi.fn(), findById: vi.fn(), markConsumed: vi.fn() };
  const intents = new IntentService(intentRepository as never);
  const service = new EmployeesService(repository as never, chainAdapter as never, intents);
  return { service, repository, chainAdapter, intentRepository };
}

const createInput = {
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  walletAddress: "GEMP",
  salaryAmount: "5000",
  payFrequency: "MONTHLY" as const,
};

describe("EmployeesService", () => {
  describe("create", () => {
    it("throws ORGANIZATION_NOT_FOUND when the org has no onChainOrgId on file", async () => {
      const { service, repository } = createMocks();
      repository.findOnChainOrgId.mockResolvedValue(null);

      await expect(service.create("org1", "GHR", "user1", createInput)).rejects.toMatchObject({
        code: "ORGANIZATION_NOT_FOUND",
      } satisfies Partial<DomainException>);
    });

    it("writes the Postgres row and builds a register-intent in one response", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      repository.findOnChainOrgId.mockResolvedValue(1n);
      repository.create.mockResolvedValue({ id: "emp1", onChainEmployeeId: null });
      chainAdapter.buildRegisterXdr.mockResolvedValue({ unsignedXdr: "UNSIGNED" });
      intentRepository.create.mockResolvedValue({ id: "intent1" });

      const result = await service.create("org1", "GHR", "user1", createInput);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org1", email: "ada@example.com" }),
      );
      expect(chainAdapter.buildRegisterXdr).toHaveBeenCalledWith({
        callerAddress: "GHR",
        onChainOrgId: 1n,
        wallet: "GEMP",
        salary: "5000",
        frequency: "MONTHLY",
      });
      expect(intentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org1", type: "EMPLOYEE_REGISTER", createdById: "user1" }),
      );
      expect(result.employee.id).toBe("emp1");
      expect(result.intentId).toBe("intent1");
    });

    it("maps a SimulationFailedError to SIMULATION_FAILED (the Postgres row still exists, per EMPLOYEE_MODEL.md §3)", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.findOnChainOrgId.mockResolvedValue(1n);
      repository.create.mockResolvedValue({ id: "emp1", onChainEmployeeId: null });
      chainAdapter.buildRegisterXdr.mockRejectedValue(new SimulationFailedError("boom"));

      await expect(service.create("org1", "GHR", "user1", createInput)).rejects.toMatchObject({
        code: "SIMULATION_FAILED",
      } satisfies Partial<DomainException>);
      expect(repository.create).toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("throws EMPLOYEE_NOT_FOUND when the employee doesn't exist in this org", async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue(null);

      await expect(service.update("org1", "GHR", "user1", "emp1", { departmentId: "dept1" })).rejects.toMatchObject({
        code: "EMPLOYEE_NOT_FOUND",
      } satisfies Partial<DomainException>);
    });

    it("a department-only change updates Postgres and does not build any on-chain intent", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.findById.mockResolvedValue({ id: "emp1", onChainEmployeeId: 5n });
      repository.update.mockResolvedValue({ id: "emp1", departmentId: "dept1" });

      const result = await service.update("org1", "GHR", "user1", "emp1", { departmentId: "dept1" });

      expect(result.intentId).toBeUndefined();
      expect(chainAdapter.buildUpdateXdr).not.toHaveBeenCalled();
    });

    it("a salary change when the employee is still pending registration (no onChainEmployeeId) updates Postgres only", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.findById.mockResolvedValue({ id: "emp1", onChainEmployeeId: null });
      repository.update.mockResolvedValue({ id: "emp1", salaryAmount: "6000" });

      const result = await service.update("org1", "GHR", "user1", "emp1", { salaryAmount: "6000" });

      expect(result.intentId).toBeUndefined();
      expect(chainAdapter.buildUpdateXdr).not.toHaveBeenCalled();
    });

    it("a salary change on an already-registered employee builds an update-intent", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      repository.findById.mockResolvedValue({ id: "emp1", onChainEmployeeId: 5n });
      repository.findOnChainOrgId.mockResolvedValue(1n);
      repository.update.mockResolvedValue({ id: "emp1", salaryAmount: "6000", payFrequency: "MONTHLY" });
      chainAdapter.buildUpdateXdr.mockResolvedValue({ unsignedXdr: "UNSIGNED" });
      intentRepository.create.mockResolvedValue({ id: "intent1" });

      const result = await service.update("org1", "GHR", "user1", "emp1", { salaryAmount: "6000" });

      expect(chainAdapter.buildUpdateXdr).toHaveBeenCalledWith(
        expect.objectContaining({ onChainOrgId: 1n, onChainEmployeeId: 5n }),
      );
      expect(result.intentId).toBe("intent1");
    });
  });

  describe("deactivate", () => {
    it("throws EMPLOYEE_NOT_FOUND when the employee doesn't exist", async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue(null);

      await expect(service.deactivate("org1", "GHR", "user1", "emp1")).rejects.toMatchObject({
        code: "EMPLOYEE_NOT_FOUND",
      } satisfies Partial<DomainException>);
    });

    it("deactivates Postgres-only when the employee never finished registration", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.findById.mockResolvedValue({ id: "emp1", onChainEmployeeId: null });
      repository.deactivate.mockResolvedValue({ id: "emp1", status: "INACTIVE" });

      const result = await service.deactivate("org1", "GHR", "user1", "emp1");

      expect(result.intentId).toBeUndefined();
      expect(chainAdapter.buildDeactivateXdr).not.toHaveBeenCalled();
    });

    it("builds a deactivate-intent when the employee is registered on-chain", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      repository.findById.mockResolvedValue({ id: "emp1", onChainEmployeeId: 5n });
      repository.findOnChainOrgId.mockResolvedValue(1n);
      repository.deactivate.mockResolvedValue({ id: "emp1", status: "INACTIVE" });
      chainAdapter.buildDeactivateXdr.mockResolvedValue({ unsignedXdr: "UNSIGNED" });
      intentRepository.create.mockResolvedValue({ id: "intent1" });

      const result = await service.deactivate("org1", "GHR", "user1", "emp1");

      expect(chainAdapter.buildDeactivateXdr).toHaveBeenCalledWith(
        expect.objectContaining({ onChainOrgId: 1n, onChainEmployeeId: 5n }),
      );
      expect(result.intentId).toBe("intent1");
    });
  });

  describe("submitRegisterIntent", () => {
    it("backfills onChainEmployeeId when the chain returns one after confirmation", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: "org1",
        type: "EMPLOYEE_REGISTER",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      chainAdapter.submitSignedXdr.mockResolvedValue({ stellarTxHash: "abc", status: "PENDING" });
      chainAdapter.waitForRegisteredEmployeeId.mockResolvedValue(7n);

      await service.submitRegisterIntent("org1", "emp1", "intent1", "SIGNED");

      expect(repository.backfillOnChainEmployeeId).toHaveBeenCalledWith("emp1", 7n);
    });

    it("does not backfill when confirmation never resolves an id (still pending)", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: "org1",
        type: "EMPLOYEE_REGISTER",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      chainAdapter.submitSignedXdr.mockResolvedValue({ stellarTxHash: "abc", status: "PENDING" });
      chainAdapter.waitForRegisteredEmployeeId.mockResolvedValue(null);

      await service.submitRegisterIntent("org1", "emp1", "intent1", "SIGNED");

      expect(repository.backfillOnChainEmployeeId).not.toHaveBeenCalled();
    });
  });
});
