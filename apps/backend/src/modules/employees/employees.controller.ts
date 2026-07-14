/// <reference types="multer" />
import { Body, Controller, Get, HttpCode, Param, Post, Patch, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  createEmployeeSchema,
  csvImportQuerySchema,
  submitIntentSchema,
  updateEmployeeSchema,
  EMPLOYEE_STATUSES,
  type CreateEmployeeInput,
  type CsvImportQuery,
  type SubmitIntentInput,
  type UpdateEmployeeInput,
} from "@workforceos/shared";
import { z } from "zod";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { MinRole } from "../../common/decorators/min-role.decorator";
import { DomainException } from "../../common/exceptions/domain.exception";
import { AuthGuard } from "../../common/guards/auth.guard";
import { OrgRoleGuard } from "../../common/guards/org-role.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-request";
import { requireCallerAddress } from "../../common/utils/require-caller-address";
import { EmployeesService } from "./employees.service";

const listQuerySchema = z.object({
  departmentId: z.string().optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
});
type ListQuery = z.infer<typeof listQuerySchema>;

@Controller("organizations/:orgId/employees")
@UseGuards(AuthGuard, OrgRoleGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @MinRole("VIEWER")
  async list(@Param("orgId") orgId: string, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery): Promise<unknown> {
    return this.employeesService.list(orgId, query);
  }

  @Get(":employeeId")
  @MinRole("VIEWER")
  async getById(@Param("orgId") orgId: string, @Param("employeeId") employeeId: string): Promise<unknown> {
    return this.employeesService.getById(orgId, employeeId);
  }

  @Post()
  @MinRole("HR")
  async create(
    @Param("orgId") orgId: string,
    @Body(new ZodValidationPipe(createEmployeeSchema)) body: CreateEmployeeInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.employeesService.create(orgId, requireCallerAddress(user), user.id, body);
  }

  /** docs/CSV_IMPORT.md §1: 5,000-row cap keeps this well under any reasonable multipart size limit. */
  @Post("import")
  @MinRole("HR")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024 } }))
  async importCsv(
    @Param("orgId") orgId: string,
    @Query(new ZodValidationPipe(csvImportQuerySchema)) query: CsvImportQuery,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    if (!file) {
      throw new DomainException("VALIDATION_ERROR", "No file uploaded — expected a multipart 'file' field.");
    }
    return this.employeesService.importCsv(orgId, requireCallerAddress(user), user.id, file.buffer, query.dryRun);
  }

  @Post(":employeeId/register-intent/:intentId/submit")
  @HttpCode(202)
  @MinRole("HR")
  async submitRegisterIntent(
    @Param("orgId") orgId: string,
    @Param("employeeId") employeeId: string,
    @Param("intentId") intentId: string,
    @Body(new ZodValidationPipe(submitIntentSchema)) body: SubmitIntentInput,
  ): Promise<unknown> {
    return this.employeesService.submitRegisterIntent(orgId, employeeId, intentId, body.signedXdr);
  }

  @Patch(":employeeId")
  @MinRole("HR")
  async update(
    @Param("orgId") orgId: string,
    @Param("employeeId") employeeId: string,
    @Body(new ZodValidationPipe(updateEmployeeSchema)) body: UpdateEmployeeInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.employeesService.update(orgId, requireCallerAddress(user), user.id, employeeId, body);
  }

  @Post(":employeeId/update-intent/:intentId/submit")
  @HttpCode(202)
  @MinRole("HR")
  async submitUpdateIntent(
    @Param("orgId") orgId: string,
    @Param("intentId") intentId: string,
    @Body(new ZodValidationPipe(submitIntentSchema)) body: SubmitIntentInput,
  ): Promise<unknown> {
    return this.employeesService.submitUpdateIntent(orgId, intentId, body.signedXdr);
  }

  @Post(":employeeId/deactivate")
  @MinRole("HR")
  async deactivate(
    @Param("orgId") orgId: string,
    @Param("employeeId") employeeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.employeesService.deactivate(orgId, requireCallerAddress(user), user.id, employeeId);
  }

  @Post(":employeeId/deactivate-intent/:intentId/submit")
  @HttpCode(202)
  @MinRole("HR")
  async submitDeactivateIntent(
    @Param("orgId") orgId: string,
    @Param("intentId") intentId: string,
    @Body(new ZodValidationPipe(submitIntentSchema)) body: SubmitIntentInput,
  ): Promise<unknown> {
    return this.employeesService.submitDeactivateIntent(orgId, intentId, body.signedXdr);
  }
}
