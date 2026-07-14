import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../prisma/prisma.service";

export interface DepartmentSpendRow {
  departmentId: string | null;
  departmentName: string;
  totalAmount: string;
}

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findTreasuryContractAddr(organizationId: string): Promise<string | null> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { treasuryContractAddr: true } });
    return org?.treasuryContractAddr ?? null;
  }

  async countActiveEmployees(organizationId: string): Promise<number> {
    return this.prisma.employee.count({ where: { organizationId, status: "ACTIVE" } });
  }

  /** Raw decimal-string amounts for the caller to sum with `decimalToStroops`/`stroopsToDecimal` (avoids floating-point). */
  async findTransactionAmounts(organizationId: string, types: string[], since?: Date): Promise<string[]> {
    const rows = await this.prisma.transaction.findMany({
      where: { organizationId, type: { in: types as never }, createdAt: since ? { gte: since } : undefined },
      select: { amount: true },
    });
    return rows.map((row) => row.amount.toString());
  }

  async findTransactionsSince(organizationId: string, since: Date): Promise<{ type: string; amount: string; createdAt: Date }[]> {
    const rows = await this.prisma.transaction.findMany({
      where: { organizationId, createdAt: { gte: since } },
      select: { type: true, amount: true, createdAt: true },
    });
    return rows.map((row) => ({ type: row.type, amount: row.amount.toString(), createdAt: row.createdAt }));
  }

  async findCompletedPayrollRunsSince(organizationId: string, since: Date): Promise<{ payPeriodStart: Date; totalAmount: string }[]> {
    const rows = await this.prisma.payrollRun.findMany({
      where: { organizationId, status: { in: ["COMPLETED", "PARTIAL"] }, payPeriodStart: { gte: since } },
      select: { payPeriodStart: true, totalAmount: true },
    });
    return rows.map((row) => ({ payPeriodStart: row.payPeriodStart, totalAmount: row.totalAmount.toString() }));
  }

  async findPaidPayrollItemsByDepartment(organizationId: string): Promise<{ departmentId: string | null; departmentName: string | null; amount: string }[]> {
    const rows = await this.prisma.payrollItem.findMany({
      where: { status: "PAID", payrollRun: { organizationId } },
      select: { amount: true, employee: { select: { departmentId: true, department: { select: { name: true } } } } },
    });
    return rows.map((row) => ({
      departmentId: row.employee.departmentId,
      departmentName: row.employee.department?.name ?? null,
      amount: row.amount.toString(),
    }));
  }
}
