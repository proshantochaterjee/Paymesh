import { Injectable } from "@nestjs/common";
import type { Milestone, MilestoneStatus } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class MilestonesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOnChainOrgId(organizationId: string): Promise<bigint | null> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { onChainOrgId: true },
    });
    return org?.onChainOrgId ?? null;
  }

  async findContractorWallet(organizationId: string, contractorId: string): Promise<string | null> {
    const contractor = await this.prisma.contractor.findFirst({
      where: { id: contractorId, organizationId },
      select: { walletAddress: true },
    });
    return contractor?.walletAddress ?? null;
  }

  async findMany(organizationId: string, filters: { status?: MilestoneStatus }): Promise<Milestone[]> {
    return this.prisma.milestone.findMany({
      where: { organizationId, status: filters.status },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(organizationId: string, milestoneId: string): Promise<Milestone | null> {
    return this.prisma.milestone.findFirst({ where: { id: milestoneId, organizationId } });
  }

  async create(data: {
    organizationId: string;
    contractorId: string;
    title: string;
    description?: string;
    amount: string;
    createdById: string;
  }): Promise<Milestone> {
    return this.prisma.milestone.create({ data });
  }

  async backfillOnChainMilestoneId(milestoneId: string, onChainMilestoneId: bigint): Promise<void> {
    await this.prisma.milestone.update({ where: { id: milestoneId }, data: { onChainMilestoneId } });
  }

  async updateStatus(milestoneId: string, status: MilestoneStatus, stellarTxHash?: string): Promise<void> {
    await this.prisma.milestone.update({ where: { id: milestoneId }, data: { status, stellarTxHash } });
  }
}
