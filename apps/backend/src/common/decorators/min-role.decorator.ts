import { SetMetadata } from "@nestjs/common";
import type { OrgRole } from "@workforceos/shared";

export const MIN_ROLE_KEY = "minRole";

/**
 * docs/PERMISSION_MODEL.md §2: declares the minimum `OrganizationMember.role`
 * required to call this handler — read by `OrgRoleGuard`, which loads the
 * caller's role for the `:id` org in the URL and checks it against this.
 */
export const MinRole = (role: OrgRole) => SetMetadata(MIN_ROLE_KEY, role);
