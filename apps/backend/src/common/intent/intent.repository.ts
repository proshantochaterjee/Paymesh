import { Injectable } from "@nestjs/common";
import type { Intent, IntentType } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";

/**
 * docs/BACKEND_ARCHITECTURE.md §5's intent pattern, factored out of
 * `treasury/` in Step 10 once `employees/` needed the exact same CRUD
 * (create/find/mark-consumed) — a real second consumer, not a
 * speculative abstraction.
 */
@Injectable()
export class IntentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: {
    organizationId: string | null;
    type: IntentType;
    unsignedXdr: string;
    expiresAt: Date;
    createdById: string;
    metadata: Record<string, string>;
  }): Promise<Intent> {
    return this.prisma.intent.create({ data: params });
  }

  async findById(id: string): Promise<Intent | null> {
    return this.prisma.intent.findUnique({ where: { id } });
  }

  async markConsumed(id: string): Promise<void> {
    await this.prisma.intent.update({ where: { id }, data: { consumedAt: new Date() } });
  }
}
