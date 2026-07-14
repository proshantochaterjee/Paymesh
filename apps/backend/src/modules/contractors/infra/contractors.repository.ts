import { Injectable } from "@nestjs/common";
import type { Contractor, ContractorStatus } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class ContractorsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(organizationId: string, filters: { status?: ContractorStatus }): Promise<Contractor[]> {
    return this.prisma.contractor.findMany({
      where: { organizationId, status: filters.status },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(organizationId: string, contractorId: string): Promise<Contractor | null> {
    return this.prisma.contractor.findFirst({ where: { id: contractorId, organizationId } });
  }

  async create(data: { organizationId: string; fullName: string; email: string; walletAddress: string }): Promise<Contractor> {
    return this.prisma.contractor.create({ data });
  }

  async update(
    contractorId: string,
    data: { fullName?: string; email?: string; walletAddress?: string },
  ): Promise<Contractor> {
    return this.prisma.contractor.update({ where: { id: contractorId }, data });
  }

  async deactivate(contractorId: string): Promise<Contractor> {
    return this.prisma.contractor.update({ where: { id: contractorId }, data: { status: "INACTIVE" } });
  }
}
