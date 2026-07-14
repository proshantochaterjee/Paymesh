import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import {
  depositIntentSchema,
  submitIntentSchema,
  withdrawIntentSchema,
  type DepositIntentInput,
  type SubmitIntentInput,
  type WithdrawIntentInput,
} from "@workforceos/shared";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { MinRole } from "../../common/decorators/min-role.decorator";
import { AuthGuard } from "../../common/guards/auth.guard";
import { OrgRoleGuard } from "../../common/guards/org-role.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-request";
import { TreasuryService } from "./treasury.service";

@Controller("organizations/:orgId/treasury")
@UseGuards(AuthGuard, OrgRoleGuard)
export class TreasuryController {
  constructor(private readonly treasuryService: TreasuryService) {}

  @Get()
  @MinRole("VIEWER")
  async getOverview(@Param("orgId") orgId: string): Promise<unknown> {
    return this.treasuryService.getOverview(orgId);
  }

  @Post("deposit-intent")
  @MinRole("FINANCE")
  async buildDepositIntent(
    @Param("orgId") orgId: string,
    @Body(new ZodValidationPipe(depositIntentSchema)) body: DepositIntentInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.treasuryService.buildDepositIntent(orgId, user.id, body);
  }

  @Post("deposit-intent/:intentId/submit")
  @HttpCode(202)
  @MinRole("FINANCE")
  async submitDepositIntent(
    @Param("orgId") orgId: string,
    @Param("intentId") intentId: string,
    @Body(new ZodValidationPipe(submitIntentSchema)) body: SubmitIntentInput,
  ): Promise<unknown> {
    return this.treasuryService.submitDepositIntent(orgId, intentId, body.signedXdr);
  }

  @Post("withdraw-intent")
  @MinRole("ADMIN")
  async buildWithdrawIntent(
    @Param("orgId") orgId: string,
    @Body(new ZodValidationPipe(withdrawIntentSchema)) body: WithdrawIntentInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.treasuryService.buildWithdrawIntent(orgId, user.id, body);
  }

  @Post("withdraw-intent/:intentId/submit")
  @HttpCode(202)
  @MinRole("ADMIN")
  async submitWithdrawIntent(
    @Param("orgId") orgId: string,
    @Param("intentId") intentId: string,
    @Body(new ZodValidationPipe(submitIntentSchema)) body: SubmitIntentInput,
  ): Promise<unknown> {
    return this.treasuryService.submitWithdrawIntent(orgId, intentId, body.signedXdr);
  }
}
