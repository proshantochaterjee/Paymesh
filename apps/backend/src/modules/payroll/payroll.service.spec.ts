import { SimulationFailedError } from "@workforceos/sdk";
import { describe, expect, it, vi } from "vitest";

import { DomainException } from "../../common/exceptions/domain.exception";
import { IntentService } from "../../common/intent/intent.service";
import { PayrollService } from "./payroll.service";

function createMocks() {
  const repository = {
    findOnChainOrgId: vi.fn(),
    findTreasuryContractAddress: vi.fn(),
    findEligibleEmployees: vi.fn(),
    createRun: vi.fn(),
    findMany: vi.fn(),
    findById: vi.fn(),
    updateRunStatus: vi.fn(),
    findPendingItems: vi.fn(),
    countItemsByStatus: vi.fn(),
    findItemsByIds: vi.fn(),
    markItemPaid: vi.fn(),
    markItemFailed: vi.fn(),
  };
  const chainAdapter = {
    getTreasuryBalanceStroops: vi.fn(),
    buildRunPayrollXdr: vi.fn(),
    submitSignedXdr: vi.fn(),
    waitForPayrollResult: vi.fn(),
  };
  const intentRepository = { create: vi.fn(), findById: vi.fn(), markConsumed: vi.fn() };
  const intents = new IntentService(intentRepository as never);
  const service = new PayrollService(repository as never, chainAdapter as never, intents);
  return { service, repository, chainAdapter, intentRepository };
}

const employee = (overrides: Partial<{ id: string; status: string; onChainEmployeeId: bigint | null; salaryAmount: string }> = {}) => ({
  id: overrides.id ?? "emp1",
  status: overrides.status ?? "ACTIVE",
  onChainEmployeeId: overrides.onChainEmployeeId ?? 1n,
  salaryAmount: { toString: () => overrides.salaryAmount ?? "100" },
});

describe("PayrollService", () => {
  describe("create", () => {
    it("throws EMPLOYEE_NOT_FOUND when a selected employee isn't in this org", async () => {
      const { service, repository } = createMocks();
      repository.findEligibleEmployees.mockResolvedValue([employee({ id: "emp1" })]);

      await expect(
        service.create("org1", "user1", { payPeriodStart: new Date(), payPeriodEnd: new Date(), employeeIds: ["emp1", "emp2"] }),
      ).rejects.toMatchObject({ code: "EMPLOYEE_NOT_FOUND" } satisfies Partial<DomainException>);
    });

    it("throws VALIDATION_ERROR when a selected employee is inactive or unregistered", async () => {
      const { service, repository } = createMocks();
      repository.findEligibleEmployees.mockResolvedValue([employee({ id: "emp1", status: "INACTIVE" })]);

      await expect(
        service.create("org1", "user1", { payPeriodStart: new Date(), payPeriodEnd: new Date(), employeeIds: ["emp1"] }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" } satisfies Partial<DomainException>);
    });

    it("creates a run with the correct snapshot total", async () => {
      const { service, repository } = createMocks();
      repository.findEligibleEmployees.mockResolvedValue([
        employee({ id: "emp1", salaryAmount: "100" }),
        employee({ id: "emp2", salaryAmount: "50" }),
      ]);
      repository.createRun.mockResolvedValue({ id: "run1", totalAmount: "150", items: [] });

      await service.create("org1", "user1", { payPeriodStart: new Date(), payPeriodEnd: new Date(), employeeIds: ["emp1", "emp2"] });

      expect(repository.createRun).toHaveBeenCalledWith(
        expect.objectContaining({
          totalAmount: "150",
          items: [
            { employeeId: "emp1", amount: "100" },
            { employeeId: "emp2", amount: "50" },
          ],
        }),
      );
    });
  });

  describe("schedule", () => {
    it("throws PAYROLL_RUN_NOT_FOUND when the run doesn't exist", async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue(null);
      await expect(service.schedule("org1", "run1")).rejects.toMatchObject({
        code: "PAYROLL_RUN_NOT_FOUND",
      } satisfies Partial<DomainException>);
    });

    it("throws INVALID_STATE_TRANSITION when the run isn't DRAFT", async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue({ id: "run1", status: "SCHEDULED", items: [] });
      await expect(service.schedule("org1", "run1")).rejects.toMatchObject({
        code: "INVALID_STATE_TRANSITION",
      } satisfies Partial<DomainException>);
    });

    it("transitions DRAFT -> SCHEDULED", async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue({ id: "run1", status: "DRAFT", items: [] });
      const result = await service.schedule("org1", "run1");
      expect(repository.updateRunStatus).toHaveBeenCalledWith("run1", "SCHEDULED");
      expect(result.status).toBe("SCHEDULED");
    });
  });

  describe("buildExecuteIntent", () => {
    it("throws INVALID_STATE_TRANSITION when the run is still DRAFT", async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue({ id: "run1", status: "DRAFT", items: [] });
      await expect(service.buildExecuteIntent("org1", "GFINANCE", "user1", "run1")).rejects.toMatchObject({
        code: "INVALID_STATE_TRANSITION",
      } satisfies Partial<DomainException>);
    });

    it("throws INVALID_STATE_TRANSITION when there are no pending items left", async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue({ id: "run1", status: "EXECUTING", items: [{}] });
      repository.findPendingItems.mockResolvedValue([]);
      await expect(service.buildExecuteIntent("org1", "GFINANCE", "user1", "run1")).rejects.toMatchObject({
        code: "INVALID_STATE_TRANSITION",
      } satisfies Partial<DomainException>);
    });

    it("throws INSUFFICIENT_TREASURY_BALANCE with the shortfall when the chunk costs more than the treasury holds", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.findById.mockResolvedValue({ id: "run1", status: "SCHEDULED", items: [{}] });
      repository.findPendingItems.mockResolvedValue([
        { id: "item1", employeeId: "emp1", amount: { toString: () => "100" }, employee: { onChainEmployeeId: 1n } },
      ]);
      repository.countItemsByStatus.mockResolvedValue({ PENDING: 1, PAID: 0, FAILED: 0 });
      repository.findOnChainOrgId.mockResolvedValue(1n);
      repository.findTreasuryContractAddress.mockResolvedValue("CTREASURY");
      chainAdapter.getTreasuryBalanceStroops.mockResolvedValue(50_0000000n); // 50, needs 100

      await expect(service.buildExecuteIntent("org1", "GFINANCE", "user1", "run1")).rejects.toMatchObject({
        code: "INSUFFICIENT_TREASURY_BALANCE",
        details: { shortfall: "50" },
      } satisfies Partial<DomainException>);
    });

    it("builds the first chunk's intent and transitions SCHEDULED -> EXECUTING", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      repository.findById.mockResolvedValue({ id: "run1", status: "SCHEDULED", items: Array.from({ length: 10 }, () => ({})) });
      repository.findPendingItems.mockResolvedValue([
        { id: "item1", employeeId: "emp1", amount: { toString: () => "100" }, employee: { onChainEmployeeId: 1n } },
      ]);
      repository.countItemsByStatus.mockResolvedValue({ PENDING: 10, PAID: 0, FAILED: 0 });
      repository.findOnChainOrgId.mockResolvedValue(1n);
      repository.findTreasuryContractAddress.mockResolvedValue("CTREASURY");
      chainAdapter.getTreasuryBalanceStroops.mockResolvedValue(1000_0000000n);
      chainAdapter.buildRunPayrollXdr.mockResolvedValue({ unsignedXdr: "UNSIGNED" });
      intentRepository.create.mockResolvedValue({ id: "intent1" });

      const result = await service.buildExecuteIntent("org1", "GFINANCE", "user1", "run1");

      expect(chainAdapter.buildRunPayrollXdr).toHaveBeenCalledWith(
        expect.objectContaining({ authorizerAddress: "GFINANCE", onChainOrgId: 1n, employeeIds: [1n] }),
      );
      expect(repository.updateRunStatus).toHaveBeenCalledWith("run1", "EXECUTING");
      expect(result.chunkIndex).toBe(0);
      expect(result.employeeIds).toEqual(["emp1"]);
    });

    it("maps a SimulationFailedError to SIMULATION_FAILED", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.findById.mockResolvedValue({ id: "run1", status: "SCHEDULED", items: [{}] });
      repository.findPendingItems.mockResolvedValue([
        { id: "item1", employeeId: "emp1", amount: { toString: () => "100" }, employee: { onChainEmployeeId: 1n } },
      ]);
      repository.countItemsByStatus.mockResolvedValue({ PENDING: 1, PAID: 0, FAILED: 0 });
      repository.findOnChainOrgId.mockResolvedValue(1n);
      repository.findTreasuryContractAddress.mockResolvedValue("CTREASURY");
      chainAdapter.getTreasuryBalanceStroops.mockResolvedValue(1000_0000000n);
      chainAdapter.buildRunPayrollXdr.mockRejectedValue(new SimulationFailedError("boom"));

      await expect(service.buildExecuteIntent("org1", "GFINANCE", "user1", "run1")).rejects.toMatchObject({
        code: "SIMULATION_FAILED",
      } satisfies Partial<DomainException>);
    });
  });

  describe("submitExecuteIntent", () => {
    function pendingIntent(metadata: Record<string, string>) {
      return {
        id: "intent1",
        organizationId: "org1",
        type: "PAYROLL_EXECUTE",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        metadata,
      };
    }

    it("marks succeeded items PAID and failed items FAILED, then completes the run when nothing is PENDING", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue(pendingIntent({ payrollRunId: "run1", itemIds: "item1,item2" }));
      chainAdapter.submitSignedXdr.mockResolvedValue({ stellarTxHash: "abc123", status: "PENDING" });
      repository.findItemsByIds.mockResolvedValue([
        { id: "item1", employee: { onChainEmployeeId: 1n } },
        { id: "item2", employee: { onChainEmployeeId: 2n } },
      ]);
      chainAdapter.waitForPayrollResult.mockResolvedValue({ succeeded: [1n], failed: [[2n, "employee_inactive"]] });
      repository.countItemsByStatus.mockResolvedValue({ PENDING: 0, PAID: 1, FAILED: 1 });

      const result = await service.submitExecuteIntent("org1", "run1", "intent1", "SIGNED");

      expect(repository.markItemPaid).toHaveBeenCalledWith("item1", "abc123");
      expect(repository.markItemFailed).toHaveBeenCalledWith("item2", "abc123", "employee_inactive");
      expect(repository.updateRunStatus).toHaveBeenCalledWith("run1", "PARTIAL");
      expect(result.isLastChunk).toBe(true);
    });

    it("marks the run COMPLETED when every item across the whole run succeeded", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue(pendingIntent({ payrollRunId: "run1", itemIds: "item1" }));
      chainAdapter.submitSignedXdr.mockResolvedValue({ stellarTxHash: "abc123", status: "PENDING" });
      repository.findItemsByIds.mockResolvedValue([{ id: "item1", employee: { onChainEmployeeId: 1n } }]);
      chainAdapter.waitForPayrollResult.mockResolvedValue({ succeeded: [1n], failed: [] });
      repository.countItemsByStatus.mockResolvedValue({ PENDING: 0, PAID: 1, FAILED: 0 });

      await service.submitExecuteIntent("org1", "run1", "intent1", "SIGNED");

      expect(repository.updateRunStatus).toHaveBeenCalledWith("run1", "COMPLETED");
    });

    it("does not finalize the run and returns isLastChunk=false when more chunks remain", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue(pendingIntent({ payrollRunId: "run1", itemIds: "item1" }));
      chainAdapter.submitSignedXdr.mockResolvedValue({ stellarTxHash: "abc123", status: "PENDING" });
      repository.findItemsByIds.mockResolvedValue([{ id: "item1", employee: { onChainEmployeeId: 1n } }]);
      chainAdapter.waitForPayrollResult.mockResolvedValue({ succeeded: [1n], failed: [] });
      repository.countItemsByStatus.mockResolvedValue({ PENDING: 5, PAID: 1, FAILED: 0 });

      const result = await service.submitExecuteIntent("org1", "run1", "intent1", "SIGNED");

      expect(repository.updateRunStatus).not.toHaveBeenCalled();
      expect(result.isLastChunk).toBe(false);
    });

    it("leaves items untouched (still PENDING) when the transaction never confirmed SUCCESS", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue(pendingIntent({ payrollRunId: "run1", itemIds: "item1" }));
      chainAdapter.submitSignedXdr.mockResolvedValue({ stellarTxHash: "abc123", status: "PENDING" });
      chainAdapter.waitForPayrollResult.mockResolvedValue(null);
      repository.countItemsByStatus.mockResolvedValue({ PENDING: 1, PAID: 0, FAILED: 0 });

      await service.submitExecuteIntent("org1", "run1", "intent1", "SIGNED");

      expect(repository.markItemPaid).not.toHaveBeenCalled();
      expect(repository.markItemFailed).not.toHaveBeenCalled();
    });

    it("throws INTENT_EXPIRED when the intent's payrollRunId doesn't match the URL's runId", async () => {
      const { service, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue(pendingIntent({ payrollRunId: "other-run", itemIds: "item1" }));

      await expect(service.submitExecuteIntent("org1", "run1", "intent1", "SIGNED")).rejects.toMatchObject({
        code: "INTENT_EXPIRED",
      } satisfies Partial<DomainException>);
    });
  });
});
