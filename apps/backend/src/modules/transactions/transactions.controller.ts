import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { transactionQuerySchema, type TransactionQuery } from "@workforceos/shared";

import { MinRole } from "../../common/decorators/min-role.decorator";
import { AuthGuard } from "../../common/guards/auth.guard";
import { OrgRoleGuard } from "../../common/guards/org-role.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { TransactionsService } from "./transactions.service";

@Controller("organizations/:orgId/transactions")
@UseGuards(AuthGuard, OrgRoleGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @MinRole("VIEWER")
  async list(
    @Param("orgId") orgId: string,
    @Query(new ZodValidationPipe(transactionQuerySchema)) query: TransactionQuery,
  ): Promise<unknown> {
    return this.transactionsService.list(orgId, query);
  }
}
