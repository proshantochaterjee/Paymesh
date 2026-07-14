import { useQuery } from "@tanstack/react-query";
import { clientFetch } from "@/lib/api/client";

export interface TreasuryData {
  balance: string;
  pendingObligations: string;
  currency: string;
}

export const useTreasury = (orgId: string) => {
  return useQuery<TreasuryData>({
    queryKey: ["org", orgId, "treasury"],
    queryFn: async () => {
      const res = await clientFetch(`/organizations/${orgId}/treasury`);
      if (!res.ok) throw new Error("Failed to fetch treasury balance");
      return res.json();
    },
    staleTime: 30 * 1000,
  });
};
