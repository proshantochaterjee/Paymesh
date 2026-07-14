import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  createContractorSchema,
  updateContractorSchema,
  CONTRACTOR_STATUSES,
  type CreateContractorInput,
  type UpdateContractorInput,
} from "@workforceos/shared";
import { z } from "zod";

import { MinRole } from "../../common/decorators/min-role.decorator";
import { AuthGuard } from "../../common/guards/auth.guard";
import { OrgRoleGuard } from "../../common/guards/org-role.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { ContractorsService } from "./contractors.service";

const listQuerySchema = z.object({ status: z.enum(CONTRACTOR_STATUSES).optional() });
type ListQuery = z.infer<typeof listQuerySchema>;

/**
 * Routes originally planned for Step 14 (module skeleton comments), moved
 * up to Step 12 since Milestone.contractorId is a required FK — see
 * DEVELOPMENT_PLAN.md's Step 12 entry.
 */
@Controller("organizations/:orgId/contractors")
@UseGuards(AuthGuard, OrgRoleGuard)
export class ContractorsController {
  constructor(private readonly contractorsService: ContractorsService) {}

  @Get()
  @MinRole("VIEWER")
  async list(@Param("orgId") orgId: string, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery): Promise<unknown> {
    return this.contractorsService.list(orgId, query);
  }

  @Get(":contractorId")
  @MinRole("VIEWER")
  async getById(@Param("orgId") orgId: string, @Param("contractorId") contractorId: string): Promise<unknown> {
    return this.contractorsService.getById(orgId, contractorId);
  }

  @Post()
  @MinRole("HR")
  async create(
    @Param("orgId") orgId: string,
    @Body(new ZodValidationPipe(createContractorSchema)) body: CreateContractorInput,
  ): Promise<unknown> {
    return this.contractorsService.create(orgId, body);
  }

  @Patch(":contractorId")
  @MinRole("HR")
  async update(
    @Param("orgId") orgId: string,
    @Param("contractorId") contractorId: string,
    @Body(new ZodValidationPipe(updateContractorSchema)) body: UpdateContractorInput,
  ): Promise<unknown> {
    return this.contractorsService.update(orgId, contractorId, body);
  }

  @Post(":contractorId/deactivate")
  @MinRole("HR")
  async deactivate(@Param("orgId") orgId: string, @Param("contractorId") contractorId: string): Promise<unknown> {
    return this.contractorsService.deactivate(orgId, contractorId);
  }
}
