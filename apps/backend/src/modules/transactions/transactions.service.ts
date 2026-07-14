import { Injectable } from "@nestjs/common";
import type { Transaction } from "@prisma/client";
import type { TransactionQuery } from "@workforceos/shared";

import { TransactionsRepository } from "./infra/transactions.repository";

export interface PaginatedTransactions {
  data: Transaction[];
  meta: { page: number; pageSize: number; total: number };
}

/**
 * Read-only queries over the Event Indexer's Transaction projection
 * (docs/EVENT_INDEXING.md) — this module only ever reads rows the
 * indexer already wrote; it has no write path of its own.
 */
@Injectable()
export class TransactionsService {
  constructor(private readonly repository: TransactionsRepository) {}

  async list(organizationId: string, query: TransactionQuery): Promise<PaginatedTransactions> {
    const { data, total } = await this.repository.findMany(
      organizationId,
      { type: query.type, status: query.status, from: query.from, to: query.to },
      query.page,
      query.pageSize,
    );

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }
}
