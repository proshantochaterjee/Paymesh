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
    // Balance changes off-chain via the indexer polling Stellar RPC
    // (docs/EVENT_INDEXING.md), not via any push from this request —
    // short polling plus a focus refetch is how the dashboard picks up
    // deposits/withdrawals made from elsewhere without a manual reload.
    refetchInterval: 15 * 1000,
    refetchOnWindowFocus: true,
  });
};
