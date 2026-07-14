export const ORG_ROLES = ["OWNER", "ADMIN", "FINANCE", "HR", "VIEWER"] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

/**
 * Mirrors the `organization` contract's `has_at_least` check
 * (docs/SMART_CONTRACT_SPECIFICATION.md §2, docs/PERMISSION_MODEL.md §1):
 * Owner > Admin > {Finance, Hr} > Viewer, where Finance and Hr are
 * deliberately incomparable — neither satisfies a minimum-role check for
 * the other, even though both outrank Viewer and are outranked by Admin.
 */
export function hasAtLeastRole(actual: OrgRole, minimum: OrgRole): boolean {
  if (actual === minimum) return true;

  switch (actual) {
    case "OWNER":
      return true;
    case "ADMIN":
      return minimum !== "OWNER";
    case "FINANCE":
      return minimum === "VIEWER";
    case "HR":
      return minimum === "VIEWER";
    case "VIEWER":
      return false;
  }
}
