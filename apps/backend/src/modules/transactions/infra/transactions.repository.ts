import { Injectable } from "@nestjs/common";
import type { Transaction, TransactionStatus, TransactionType } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";

export interface TransactionFilters {
  type?: TransactionType;
  status?: TransactionStatus;
  from?: Date;
  to?: Date;
}

@Injectable()
export class TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    organizationId: string,
    filters: TransactionFilters,
    page: number,
    pageSize: number,
  ): Promise<{ data: Transaction[]; total: number }> {
    const where = {
      organizationId,
      type: filters.type,
      status: filters.status,
      createdAt:
        filters.from || filters.to
          ? {
              gte: filters.from,
              lte: filters.to,
            }
          : undefined,
    };

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { data, total };
  }
}
