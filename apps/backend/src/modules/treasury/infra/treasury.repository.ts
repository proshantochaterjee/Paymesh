import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class TreasuryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findTreasuryContractAddress(organizationId: string): Promise<string | null> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { treasuryContractAddr: true },
    });
    return org?.treasuryContractAddr ?? null;
  }

  /**
   * docs/TREASURY_ARCHITECTURE.md §3: sum of SCHEDULED PayrollRuns not yet
   * executed + FUNDED/APPROVED Milestones (already escrowed, not yet
   * released). Both are zero until Steps 11/12 add real rows — that's
   * expected, not a bug (the query is correct today, the data catches up
   * later).
   */
  async sumPendingObligations(organizationId: string): Promise<{ scheduledPayroll: string; escrowedMilestones: string }> {
    const [payrollSum, milestoneSum] = await Promise.all([
      this.prisma.payrollRun.aggregate({
        where: { organizationId, status: "SCHEDULED" },
        _sum: { totalAmount: true },
      }),
      this.prisma.milestone.aggregate({
        where: { organizationId, status: { in: ["FUNDED", "APPROVED"] } },
        _sum: { amount: true },
      }),
    ]);

    return {
      scheduledPayroll: (payrollSum._sum.totalAmount ?? 0).toString(),
      escrowedMilestones: (milestoneSum._sum.amount ?? 0).toString(),
    };
  }
}
