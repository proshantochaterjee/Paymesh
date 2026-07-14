import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasAtLeastRole, type OrgRole } from "@workforceos/shared";

import { DomainException } from "../exceptions/domain.exception";
import { PrismaService } from "../../prisma/prisma.service";
import { MIN_ROLE_KEY } from "../decorators/min-role.decorator";
import type { AuthenticatedRequest } from "../types/authenticated-request";

/**
 * docs/PERMISSION_MODEL.md §2 (API layer, layer 2 of 3 — UX-fast rejection,
 * never the sole boundary for anything fund-moving; the smart contract is
 * the real boundary). Reads `@MinRole(...)` off the handler and checks the
 * caller's `OrganizationMember.role` for the org in the URL (`:orgId` or
 * `:id`, see below). Runs after `AuthGuard`, which must have already
 * attached `req.user`.
 */
@Injectable()
export class OrgRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const minRole = this.reflector.get<OrgRole | undefined>(MIN_ROLE_KEY, context.getHandler());
    if (!minRole) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) {
      throw new DomainException("UNAUTHENTICATED", "Sign in required.");
    }

    // Nested resource controllers (treasury, employees, ...) scope their
    // whole prefix with `:orgId` (apps/backend/src/modules/*/*.controller.ts,
    // Step 5); the organization resource's own routes use `:id` instead.
    const organizationId = req.params.orgId ?? req.params.id;
    if (typeof organizationId !== "string" || organizationId.length === 0) {
      throw new DomainException("VALIDATION_ERROR", "Route is missing an organization id.");
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: req.user.id } },
    });
    if (!membership || !hasAtLeastRole(membership.role, minRole)) {
      throw new DomainException("FORBIDDEN_ROLE", "Your role does not permit this action.");
    }

    return true;
  }
}
