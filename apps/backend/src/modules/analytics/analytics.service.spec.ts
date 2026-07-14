import { describe, expect, it, vi } from "vitest";

import { DomainException } from "../../common/exceptions/domain.exception";
import { AnalyticsService } from "./analytics.service";

function createMocks() {
  const repository = {
    findTreasuryContractAddr: vi.fn(),
    countActiveEmployees: vi.fn(),
    findTransactionAmounts: vi.fn(),
    findTransactionsSince: vi.fn(),
    findCompletedPayrollRunsSince: vi.fn(),
    findPaidPayrollItemsByDepartment: vi.fn(),
  };
  const chainAdapter = { getTreasuryBalance: vi.fn() };
  const service = new AnalyticsService(repository as never, chainAdapter as never);
  return { service, repository, chainAdapter };
}

describe("AnalyticsService", () => {
  describe("getOverview", () => {
    it("throws ORGANIZATION_NOT_FOUND when the org has no treasury contract on file", async () => {
      const { service, repository } = createMocks();
      repository.findTreasuryContractAddr.mockResolvedValue(null);

      await expect(service.getOverview("org1")).rejects.toMatchObject({
        code: "ORGANIZATION_NOT_FOUND",
      } satisfies Partial<DomainException>);
    });

    it("combines live treasury balance, headcount, and MTD outflow spend", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.findTreasuryContractAddr.mockResolvedValue("CTREASURY");
      repository.countActiveEmployees.mockResolvedValue(7);
      chainAdapter.getTreasuryBalance.mockResolvedValue("1000");
      repository.findTransactionAmounts.mockResolvedValue(["100", "50.5"]);

      const result = await service.getOverview("org1");

      expect(result).toEqual({ headcount: 7, treasuryBalance: "1000", monthToDateSpend: "150.5" });
      expect(repository.findTransactionAmounts).toHaveBeenCalledWith(
        "org1",
        ["WITHDRAWAL", "PAYROLL_DISBURSEMENT", "MILESTONE_FUND"],
        expect.any(Date),
      );
    });
  });

  describe("getPayrollTrends", () => {
    it("buckets payroll run totals by the month of payPeriodStart and fills empty months with zero", async () => {
      const { service, repository } = createMocks();
      const now = new Date();
      repository.findCompletedPayrollRunsSince.mockResolvedValue([
        { payPeriodStart: now, totalAmount: "1000" },
        { payPeriodStart: now, totalAmount: "500" },
      ]);

      const result = await service.getPayrollTrends("org1");

      expect(result).toHaveLength(6);
      expect(result[result.length - 1]!.totalAmount).toBe("1500");
      expect(result[0]!.totalAmount).toBe("0");
    });
  });

  describe("getTreasuryFlow", () => {
    it("separates DEPOSIT into inflow and WITHDRAWAL/PAYROLL_DISBURSEMENT/MILESTONE_FUND into outflow", async () => {
      const { service, repository } = createMocks();
      const now = new Date();
      repository.findTransactionsSince.mockResolvedValue([
        { type: "DEPOSIT", amount: "200", createdAt: now },
        { type: "WITHDRAWAL", amount: "30", createdAt: now },
        { type: "PAYROLL_DISBURSEMENT", amount: "70", createdAt: now },
      ]);

      const result = await service.getTreasuryFlow("org1");
      const currentMonth = result[result.length - 1]!;

      expect(currentMonth.inflow).toBe("200");
      expect(currentMonth.outflow).toBe("100");
    });
  });

  describe("getDepartmentSpend", () => {
    it("groups paid payroll item amounts by department, bucketing null departments as Unassigned", async () => {
      const { service, repository } = createMocks();
      repository.findPaidPayrollItemsByDepartment.mockResolvedValue([
        { departmentId: "dept1", departmentName: "Engineering", amount: "1000" },
        { departmentId: "dept1", departmentName: "Engineering", amount: "500" },
        { departmentId: null, departmentName: null, amount: "250" },
      ]);

      const result = await service.getDepartmentSpend("org1");

      expect(result).toContainEqual({ departmentId: "dept1", departmentName: "Engineering", totalAmount: "1500" });
      expect(result).toContainEqual({ departmentId: null, departmentName: "Unassigned", totalAmount: "250" });
    });
  });
});
