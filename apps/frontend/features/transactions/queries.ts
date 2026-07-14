import { useQuery } from "@tanstack/react-query";
import { clientFetch } from "@/lib/api/client";

export interface Transaction {
  id: string;
  type: string;
  status: string;
  amount: string;
  asset: string;
  stellarTxHash: string | null;
  createdAt: string;
}

export const useTransactions = (orgId: string, filters: Record<string, string | null>) => {
  return useQuery<{ data: Transaction[]; meta: unknown }>({
    queryKey: ["org", orgId, "transactions", filters],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v) searchParams.set(k, v);
      });
      const res = await clientFetch(`/organizations/${orgId}/transactions?${searchParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    staleTime: 30 * 1000,
  });
};
