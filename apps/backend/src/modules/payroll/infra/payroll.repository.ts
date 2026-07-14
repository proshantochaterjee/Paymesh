import { Injectable } from "@nestjs/common";
import type { Employee, PayrollItem, PayrollItemStatus, PayrollRun, PayrollRunStatus } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class PayrollRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOnChainOrgId(organizationId: string): Promise<bigint | null> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { onChainOrgId: true },
    });
    return org?.onChainOrgId ?? null;
  }

  async findTreasuryContractAddress(organizationId: string): Promise<string | null> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { treasuryContractAddr: true },
    });
    return org?.treasuryContractAddr ?? null;
  }

  /** Only employees eligible for payroll: this org, ACTIVE, confirmed on-chain (docs/EMPLOYEE_MODEL.md §3). */
  async findEligibleEmployees(organizationId: string, employeeIds: string[]): Promise<Employee[]> {
    return this.prisma.employee.findMany({
      where: { id: { in: employeeIds }, organizationId },
    });
  }

  async createRun(data: {
    organizationId: string;
    payPeriodStart: Date;
    payPeriodEnd: Date;
    totalAmount: string;
    createdById: string;
    items: Array<{ employeeId: string; amount: string }>;
  }): Promise<PayrollRun & { items: PayrollItem[] }> {
    return this.prisma.payrollRun.create({
      data: {
        organizationId: data.organizationId,
        payPeriodStart: data.payPeriodStart,
        payPeriodEnd: data.payPeriodEnd,
        totalAmount: data.totalAmount,
        createdById: data.createdById,
        items: { create: data.items },
      },
      include: { items: true },
    });
  }

  async findMany(organizationId: string): Promise<PayrollRun[]> {
    return this.prisma.payrollRun.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  }

  async findById(organizationId: string, runId: string): Promise<(PayrollRun & { items: PayrollItem[] }) | null> {
    return this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId },
      include: { items: true },
    });
  }

  async updateRunStatus(runId: string, status: PayrollRunStatus): Promise<void> {
    await this.prisma.payrollRun.update({ where: { id: runId }, data: { status } });
  }

  /**
   * The next unprocessed chunk: PENDING items only, oldest-first for a
   * deterministic, reproducible chunk order across retries.
   */
  async findPendingItems(payrollRunId: string, take: number): Promise<Array<PayrollItem & { employee: Employee }>> {
    return this.prisma.payrollItem.findMany({
      where: { payrollRunId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take,
      include: { employee: true },
    });
  }

  async countItemsByStatus(payrollRunId: string): Promise<Record<PayrollItemStatus, number>> {
    const grouped = await this.prisma.payrollItem.groupBy({
      by: ["status"],
      where: { payrollRunId },
      _count: { _all: true },
    });
    const counts: Record<PayrollItemStatus, number> = { PENDING: 0, PAID: 0, FAILED: 0 };
    for (const row of grouped) counts[row.status] = row._count._all;
    return counts;
  }

  async findItemsByIds(itemIds: string[]): Promise<Array<PayrollItem & { employee: Employee }>> {
    return this.prisma.payrollItem.findMany({ where: { id: { in: itemIds } }, include: { employee: true } });
  }

  async markItemPaid(itemId: string, stellarTxHash: string): Promise<void> {
    await this.prisma.payrollItem.update({ where: { id: itemId }, data: { status: "PAID", stellarTxHash } });
  }

  async markItemFailed(itemId: string, stellarTxHash: string, failureReason: string): Promise<void> {
    await this.prisma.payrollItem.update({ where: { id: itemId }, data: { status: "FAILED", stellarTxHash, failureReason } });
  }
}
