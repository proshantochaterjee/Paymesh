import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import { MinRole } from "../../common/decorators/min-role.decorator";
import { AuthGuard } from "../../common/guards/auth.guard";
import { OrgRoleGuard } from "../../common/guards/org-role.guard";
import { AnalyticsService } from "./analytics.service";

@Controller("organizations/:orgId/analytics")
@UseGuards(AuthGuard, OrgRoleGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("overview")
  @MinRole("VIEWER")
  async getOverview(@Param("orgId") orgId: string): Promise<unknown> {
    return this.analyticsService.getOverview(orgId);
  }

  @Get("payroll-trends")
  @MinRole("VIEWER")
  async getPayrollTrends(@Param("orgId") orgId: string): Promise<unknown> {
    return this.analyticsService.getPayrollTrends(orgId);
  }

  @Get("treasury-flow")
  @MinRole("VIEWER")
  async getTreasuryFlow(@Param("orgId") orgId: string): Promise<unknown> {
    return this.analyticsService.getTreasuryFlow(orgId);
  }

  @Get("department-spend")
  @MinRole("VIEWER")
  async getDepartmentSpend(@Param("orgId") orgId: string): Promise<unknown> {
    return this.analyticsService.getDepartmentSpend(orgId);
  }
}
