import type { OrgRole } from "@workforceos/shared";
import { hasAtLeastRole } from "@workforceos/shared";
import { useMembers } from "@/features/settings/queries";
import { useCurrentUser } from "./useCurrentUser";

/**
 * Derives the caller's own role within `orgId` from the members list —
 * there's no dedicated "my membership" endpoint, and the members list is
 * already fetched by the Settings page, so this reuses that query rather
 * than adding a second one (docs/PERMISSION_MODEL.md: frontend gating is
 * UX only, hide/disable — the API/contract layers are the real boundary
 * regardless of what this hook returns).
 */
export function useMyRole(orgId: string): { role: OrgRole | null; isLoading: boolean; can: (minimum: OrgRole) => boolean } {
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();
  const { data: members, isLoading: isLoadingMembers } = useMembers(orgId);

  const role = members?.find((m) => m.userId === currentUser?.id)?.role ?? null;

  return {
    role,
    isLoading: isLoadingUser || isLoadingMembers,
    can: (minimum: OrgRole) => role !== null && hasAtLeastRole(role, minimum),
  };
}
