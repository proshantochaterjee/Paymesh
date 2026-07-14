import { Injectable } from "@nestjs/common";
import type { IndexerCursor, MilestoneStatus, TransactionStatus, TransactionType } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";

export interface OrganizationContractAddresses {
  id: string;
  organizationContractAddr: string;
  treasuryContractAddr: string;
}

export interface InsertTransactionInput {
  organizationId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: string;
  fromAddress: string;
  toAddress: string;
  stellarTxHash: string;
  stellarEventId: string;
  ledgerSequence: bigint;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

@Injectable()
export class IndexerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getCursor(contractAddress: string): Promise<IndexerCursor | null> {
    return this.prisma.indexerCursor.findUnique({ where: { contractAddress } });
  }

  async upsertCursor(contractAddress: string, lastLedgerSequence: bigint): Promise<void> {
    await this.prisma.indexerCursor.upsert({
      where: { contractAddress },
      create: { contractAddress, lastLedgerSequence },
      update: { lastLedgerSequence },
    });
  }

  async listOrganizationContracts(): Promise<OrganizationContractAddresses[]> {
    return this.prisma.organization.findMany({
      select: { id: true, organizationContractAddr: true, treasuryContractAddr: true },
    });
  }

  async findOrganizationIdByOnChainId(onChainOrgId: bigint): Promise<string | null> {
    const org = await this.prisma.organization.findUnique({ where: { onChainOrgId }, select: { id: true } });
    return org?.id ?? null;
  }

  /**
   * docs/EVENT_INDEXING.md §4: idempotent upsert keyed by the Soroban RPC
   * event's own globally-unique id — reprocessing the same ledger range
   * (e.g. after a crash before the cursor was persisted) never creates a
   * duplicate row.
   */
  async upsertTransaction(input: InsertTransactionInput): Promise<void> {
    await this.prisma.transaction.upsert({
      where: { stellarEventId: input.stellarEventId },
      create: input,
      update: {},
    });
  }

  async updateMilestoneStatusByOnChainId(organizationId: string, onChainMilestoneId: bigint, status: MilestoneStatus): Promise<void> {
    await this.prisma.milestone.updateMany({
      where: { organizationId, onChainMilestoneId },
      data: { status },
    });
  }
}
