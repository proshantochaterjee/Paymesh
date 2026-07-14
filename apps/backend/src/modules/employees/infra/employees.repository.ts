import { Injectable } from "@nestjs/common";
import type { Employee, EmployeeStatus } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class EmployeesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOnChainOrgId(organizationId: string): Promise<bigint | null> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { onChainOrgId: true },
    });
    return org?.onChainOrgId ?? null;
  }

  async findMany(organizationId: string, filters: { departmentId?: string; status?: EmployeeStatus }): Promise<Employee[]> {
    return this.prisma.employee.findMany({
      where: { organizationId, departmentId: filters.departmentId, status: filters.status },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(organizationId: string, employeeId: string): Promise<Employee | null> {
    return this.prisma.employee.findFirst({ where: { id: employeeId, organizationId } });
  }

  async findActiveByEmail(organizationId: string, email: string): Promise<Employee | null> {
    return this.prisma.employee.findFirst({ where: { organizationId, email, status: "ACTIVE" } });
  }

  async create(data: {
    organizationId: string;
    departmentId?: string;
    fullName: string;
    email: string;
    walletAddress: string;
    salaryAmount: string;
    payFrequency: "WEEKLY" | "BI_WEEKLY" | "MONTHLY";
  }): Promise<Employee> {
    return this.prisma.employee.create({ data });
  }

  async update(
    employeeId: string,
    data: { salaryAmount?: string; payFrequency?: "WEEKLY" | "BI_WEEKLY" | "MONTHLY"; departmentId?: string },
  ): Promise<Employee> {
    return this.prisma.employee.update({ where: { id: employeeId }, data });
  }

  async deactivate(employeeId: string): Promise<Employee> {
    return this.prisma.employee.update({ where: { id: employeeId }, data: { status: "INACTIVE" } });
  }

  async backfillOnChainEmployeeId(employeeId: string, onChainEmployeeId: bigint): Promise<Employee> {
    return this.prisma.employee.update({ where: { id: employeeId }, data: { onChainEmployeeId } });
  }

  /** docs/CSV_IMPORT.md §1: department is created on the fly, matched case-insensitively. */
  async findOrCreateDepartment(organizationId: string, name: string): Promise<{ id: string }> {
    const existing = await this.prisma.department.findFirst({
      where: { organizationId, name: { equals: name, mode: "insensitive" } },
    });
    if (existing) return existing;
    return this.prisma.department.create({ data: { organizationId, name } });
  }
}
