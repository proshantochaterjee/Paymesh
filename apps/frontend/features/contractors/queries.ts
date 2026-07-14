import { useQuery } from "@tanstack/react-query";
import { clientFetch } from "@/lib/api/client";
import { Contractor } from "@workforceos/shared";

export const useContractors = (orgId: string) => {
  return useQuery<Contractor[]>({
    queryKey: ["org", orgId, "contractors"],
    queryFn: async () => {
      const res = await clientFetch(`/organizations/${orgId}/contractors`);
      if (!res.ok) throw new Error("Failed to fetch contractors");
      return res.json();
    },
    staleTime: 30 * 1000,
  });
};

export const useContractor = (orgId: string, contractorId: string) => {
  return useQuery<Contractor>({
    queryKey: ["org", orgId, "contractors", contractorId],
    queryFn: async () => {
      const res = await clientFetch(`/organizations/${orgId}/contractors/${contractorId}`);
      if (!res.ok) throw new Error("Failed to fetch contractor");
      return res.json();
    },
    staleTime: 30 * 1000,
  });
};
