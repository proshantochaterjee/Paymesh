import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import {
  createPayrollRunSchema,
  submitIntentSchema,
  type CreatePayrollRunInput,
  type SubmitIntentInput,
} from "@workforceos/shared";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { MinRole } from "../../common/decorators/min-role.decorator";
import { AuthGuard } from "../../common/guards/auth.guard";
import { OrgRoleGuard } from "../../common/guards/org-role.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-request";
import { requireCallerAddress } from "../../common/utils/require-caller-address";
import { PayrollService } from "./payroll.service";

@Controller("organizations/:orgId/payroll-runs")
@UseGuards(AuthGuard, OrgRoleGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get()
  @MinRole("VIEWER")
  async list(@Param("orgId") orgId: string): Promise<unknown> {
    return this.payrollService.list(orgId);
  }

  @Get(":runId")
  @MinRole("VIEWER")
  async getById(@Param("orgId") orgId: string, @Param("runId") runId: string): Promise<unknown> {
    return this.payrollService.getById(orgId, runId);
  }

  @Post()
  @MinRole("FINANCE")
  async create(
    @Param("orgId") orgId: string,
    @Body(new ZodValidationPipe(createPayrollRunSchema)) body: CreatePayrollRunInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollService.create(orgId, user.id, body);
  }

  @Post(":runId/schedule")
  @MinRole("FINANCE")
  async schedule(@Param("orgId") orgId: string, @Param("runId") runId: string): Promise<unknown> {
    return this.payrollService.schedule(orgId, runId);
  }

  @Post(":runId/execute-intent")
  @MinRole("FINANCE")
  async buildExecuteIntent(
    @Param("orgId") orgId: string,
    @Param("runId") runId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollService.buildExecuteIntent(orgId, requireCallerAddress(user), user.id, runId);
  }

  @Post(":runId/execute-intent/:intentId/submit")
  @HttpCode(202)
  @MinRole("FINANCE")
  async submitExecuteIntent(
    @Param("orgId") orgId: string,
    @Param("runId") runId: string,
    @Param("intentId") intentId: string,
    @Body(new ZodValidationPipe(submitIntentSchema)) body: SubmitIntentInput,
  ): Promise<unknown> {
    return this.payrollService.submitExecuteIntent(orgId, runId, intentId, body.signedXdr);
  }
}
