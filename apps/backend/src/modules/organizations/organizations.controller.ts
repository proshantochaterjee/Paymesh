import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  addMemberSchema,
  createOrganizationSchema,
  submitIntentSchema,
  updateMemberRoleSchema,
  updateOrganizationSchema,
  type AddMemberInput,
  type CreateOrganizationInput,
  type SubmitIntentInput,
  type UpdateMemberRoleInput,
  type UpdateOrganizationInput,
} from "@workforceos/shared";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { MinRole } from "../../common/decorators/min-role.decorator";
import { AuthGuard } from "../../common/guards/auth.guard";
import { OrgRoleGuard } from "../../common/guards/org-role.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-request";
import { requireCallerAddress } from "../../common/utils/require-caller-address";
import { OrganizationsService } from "./organizations.service";

/**
 * docs/API_SPECIFICATION.md documents org creation and member
 * add/change-role/remove each as a single HTTP call — but every one of
 * them requires `require_auth()` from a wallet the backend never holds
 * (owner for `create_organization`, an ADMIN/OWNER caller for
 * `grant_role`/`revoke_role`), so each is implemented as the same
 * build-XDR / sign-client-side / submit-signed-XDR pair used everywhere
 * else in this API (see "Every 'intent' endpoint follows the same
 * shape"), not a single synchronous endpoint.
 */
@Controller("organizations")
@UseGuards(AuthGuard, OrgRoleGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.organizationsService.list(user.id);
  }

  @Post("create-intent")
  async buildCreateIntent(
    @Body(new ZodValidationPipe(createOrganizationSchema)) body: CreateOrganizationInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.organizationsService.buildCreateIntent(user.id, requireCallerAddress(user), body.name);
  }

  @Post("create-intent/:intentId/submit")
  async submitCreateIntent(
    @Param("intentId") intentId: string,
    @Body(new ZodValidationPipe(submitIntentSchema)) body: SubmitIntentInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.organizationsService.submitCreateIntent(user.id, intentId, body.signedXdr);
  }

  @Get(":id")
  @MinRole("VIEWER")
  async getById(@Param("id") id: string): Promise<unknown> {
    return this.organizationsService.getById(id);
  }

  @Patch(":id")
  @MinRole("ADMIN")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateOrganizationSchema)) body: UpdateOrganizationInput,
  ): Promise<unknown> {
    if (body.name === undefined) {
      return this.organizationsService.getById(id);
    }
    return this.organizationsService.updateName(id, body.name);
  }

  @Get(":id/members")
  @MinRole("VIEWER")
  async listMembers(@Param("id") id: string): Promise<unknown> {
    return this.organizationsService.listMembers(id);
  }

  @Post(":id/members/add-intent")
  @MinRole("ADMIN")
  async buildAddMemberIntent(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addMemberSchema)) body: AddMemberInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.organizationsService.buildAddMemberIntent(id, user.id, requireCallerAddress(user), body.email, body.role);
  }

  @Post(":id/members/add-intent/:intentId/submit")
  @HttpCode(201)
  @MinRole("ADMIN")
  async submitAddMemberIntent(
    @Param("id") id: string,
    @Param("intentId") intentId: string,
    @Body(new ZodValidationPipe(submitIntentSchema)) body: SubmitIntentInput,
  ): Promise<unknown> {
    return this.organizationsService.submitGrantRoleIntent(id, intentId, body.signedXdr);
  }

  @Post(":id/members/:memberId/role-intent")
  @MinRole("ADMIN")
  async buildUpdateMemberRoleIntent(
    @Param("id") id: string,
    @Param("memberId") memberId: string,
    @Body(new ZodValidationPipe(updateMemberRoleSchema)) body: UpdateMemberRoleInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.organizationsService.buildUpdateMemberRoleIntent(id, user.id, requireCallerAddress(user), memberId, body.role);
  }

  @Post(":id/members/:memberId/role-intent/:intentId/submit")
  @HttpCode(200)
  @MinRole("ADMIN")
  async submitUpdateMemberRoleIntent(
    @Param("id") id: string,
    @Param("intentId") intentId: string,
    @Body(new ZodValidationPipe(submitIntentSchema)) body: SubmitIntentInput,
  ): Promise<unknown> {
    return this.organizationsService.submitGrantRoleIntent(id, intentId, body.signedXdr);
  }

  @Post(":id/members/:memberId/remove-intent")
  @MinRole("ADMIN")
  async buildRemoveMemberIntent(
    @Param("id") id: string,
    @Param("memberId") memberId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.organizationsService.buildRemoveMemberIntent(id, user.id, requireCallerAddress(user), memberId);
  }

  @Post(":id/members/:memberId/remove-intent/:intentId/submit")
  @HttpCode(200)
  @MinRole("ADMIN")
  async submitRemoveMemberIntent(
    @Param("id") id: string,
    @Param("intentId") intentId: string,
    @Body(new ZodValidationPipe(submitIntentSchema)) body: SubmitIntentInput,
  ): Promise<unknown> {
    return this.organizationsService.submitRemoveMemberIntent(id, intentId, body.signedXdr);
  }
}
