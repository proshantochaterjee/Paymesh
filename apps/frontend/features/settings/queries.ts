import { useQuery } from "@tanstack/react-query";
import { clientFetch } from "@/lib/api/client";
import { Organization } from "@workforceos/shared";
import { OrganizationMember } from "@workforceos/shared";

export const useOrganization = (orgId: string) => {
  return useQuery<Organization>({
    queryKey: ["org", orgId],
    queryFn: async () => {
      const res = await clientFetch(`/organizations/${orgId}`);
      if (!res.ok) throw new Error("Failed to fetch organization details");
      return res.json();
    },
    staleTime: 60 * 1000,
  });
};

// Backend returns a plain array for this endpoint (matches Employees/
// Contractors' convention) — not the {data, meta} pagination envelope
// Transactions uses.
export const useMembers = (orgId: string) => {
  return useQuery<OrganizationMember[]>({
    queryKey: ["org", orgId, "members"],
    queryFn: async () => {
      const res = await clientFetch(`/organizations/${orgId}/members`);
      if (!res.ok) throw new Error("Failed to fetch members");
      return res.json();
    },
    staleTime: 30 * 1000,
  });
};
