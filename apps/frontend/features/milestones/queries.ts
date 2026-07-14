import { useQuery } from "@tanstack/react-query";
import { clientFetch } from "@/lib/api/client";
import { Milestone } from "@workforceos/shared";

// Backend returns a plain array for this endpoint (matches Employees/
// Contractors' convention) — not the {data, meta} pagination envelope
// Transactions uses.
export const useMilestones = (orgId: string) => {
  return useQuery<Milestone[]>({
    queryKey: ["org", orgId, "milestones"],
    queryFn: async () => {
      const res = await clientFetch(`/organizations/${orgId}/milestones`);
      if (!res.ok) throw new Error("Failed to fetch milestones");
      return res.json();
    },
    staleTime: 30 * 1000,
  });
};

export const useMilestone = (orgId: string, milestoneId: string) => {
  return useQuery<Milestone>({
    queryKey: ["org", orgId, "milestones", milestoneId],
    queryFn: async () => {
      const res = await clientFetch(`/organizations/${orgId}/milestones/${milestoneId}`);
      if (!res.ok) throw new Error("Failed to fetch milestone details");
      return res.json();
    },
    staleTime: 30 * 1000,
  });
};
