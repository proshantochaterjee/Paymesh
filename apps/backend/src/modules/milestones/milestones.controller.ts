import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  createMilestoneSchema,
  submitIntentSchema,
  MILESTONE_STATUSES,
  type CreateMilestoneInput,
  type SubmitIntentInput,
} from "@workforceos/shared";
import { z } from "zod";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { MinRole } from "../../common/decorators/min-role.decorator";
import { AuthGuard } from "../../common/guards/auth.guard";
import { OrgRoleGuard } from "../../common/guards/org-role.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-request";
import { requireCallerAddress } from "../../common/utils/require-caller-address";
import { MilestonesService } from "./milestones.service";

const listQuerySchema = z.object({ status: z.enum(MILESTONE_STATUSES).optional() });
type ListQuery = z.infer<typeof listQuerySchema>;

@Controller("organizations/:orgId/milestones")
@UseGuards(AuthGuard, OrgRoleGuard)
export class MilestonesController {
  constructor(private readonly milestonesService: MilestonesService) {}

  @Get()
  @MinRole("VIEWER")
  async list(@Param("orgId") orgId: string, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery): Promise<unknown> {
    return this.milestonesService.list(orgId, query);
  }

  @Get(":milestoneId")
  @MinRole("VIEWER")
  async getById(@Param("orgId") orgId: string, @Param("milestoneId") milestoneId: string): Promise<unknown> {
    return this.milestonesService.getById(orgId, milestoneId);
  }

  @Post()
  @MinRole("FINANCE")
  async create(
    @Param("orgId") orgId: string,
    @Body(new ZodValidationPipe(createMilestoneSchema)) body: CreateMilestoneInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.milestonesService.create(orgId, body, user.id);
  }

  @Post(":milestoneId/fund-intent")
  @MinRole("FINANCE")
  async buildFundIntent(
    @Param("orgId") orgId: string,
    @Param("milestoneId") milestoneId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.milestonesService.buildFundIntent(orgId, requireCallerAddress(user), user.id, milestoneId);
  }

  @Post(":milestoneId/fund-intent/:intentId/submit")
  @HttpCode(202)
  @MinRole("FINANCE")
  async submitFundIntent(
    @Param("orgId") orgId: string,
    @Param("milestoneId") milestoneId: string,
    @Param("intentId") intentId: string,
    @Body(new ZodValidationPipe(submitIntentSchema)) body: SubmitIntentInput,
  ): Promise<unknown> {
    return this.milestonesService.submitFundIntent(orgId, milestoneId, intentId, body.signedXdr);
  }

  @Post(":milestoneId/approve-intent")
  @MinRole("FINANCE")
  async buildApproveIntent(
    @Param("orgId") orgId: string,
    @Param("milestoneId") milestoneId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.milestonesService.buildApproveIntent(orgId, requireCallerAddress(user), user.id, milestoneId);
  }

  @Post(":milestoneId/approve-intent/:intentId/submit")
  @HttpCode(202)
  @MinRole("FINANCE")
  async submitApproveIntent(
    @Param("orgId") orgId: string,
    @Param("milestoneId") milestoneId: string,
    @Param("intentId") intentId: string,
    @Body(new ZodValidationPipe(submitIntentSchema)) body: SubmitIntentInput,
  ): Promise<unknown> {
    return this.milestonesService.submitApproveIntent(orgId, milestoneId, intentId, body.signedXdr);
  }

  @Post(":milestoneId/release-intent")
  @MinRole("FINANCE")
  async buildReleaseIntent(
    @Param("orgId") orgId: string,
    @Param("milestoneId") milestoneId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.milestonesService.buildReleaseIntent(orgId, requireCallerAddress(user), user.id, milestoneId);
  }

  @Post(":milestoneId/release-intent/:intentId/submit")
  @HttpCode(202)
  @MinRole("FINANCE")
  async submitReleaseIntent(
    @Param("orgId") orgId: string,
    @Param("milestoneId") milestoneId: string,
    @Param("intentId") intentId: string,
    @Body(new ZodValidationPipe(submitIntentSchema)) body: SubmitIntentInput,
  ): Promise<unknown> {
    return this.milestonesService.submitReleaseIntent(orgId, milestoneId, intentId, body.signedXdr);
  }

  @Post(":milestoneId/cancel-intent")
  @MinRole("FINANCE")
  async cancel(
    @Param("orgId") orgId: string,
    @Param("milestoneId") milestoneId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.milestonesService.cancel(orgId, requireCallerAddress(user), user.id, milestoneId);
  }

  @Post(":milestoneId/cancel-intent/:intentId/submit")
  @HttpCode(202)
  @MinRole("FINANCE")
  async submitCancelIntent(
    @Param("orgId") orgId: string,
    @Param("milestoneId") milestoneId: string,
    @Param("intentId") intentId: string,
    @Body(new ZodValidationPipe(submitIntentSchema)) body: SubmitIntentInput,
  ): Promise<unknown> {
    return this.milestonesService.submitCancelIntent(orgId, milestoneId, intentId, body.signedXdr);
  }
}
