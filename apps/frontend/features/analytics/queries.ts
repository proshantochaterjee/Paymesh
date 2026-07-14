import { useQuery } from "@tanstack/react-query";
import { clientFetch } from "@/lib/api/client";

export const useAnalyticsOverview = (orgId: string) => {
  return useQuery<{ headcount: number; treasuryBalance: string; monthToDateSpend: string }>({
    queryKey: ["org", orgId, "analytics", "overview"],
    queryFn: async () => {
      const res = await clientFetch(`/organizations/${orgId}/analytics/overview`);
      if (!res.ok) throw new Error("Failed to fetch overview");
      return res.json();
    },
    staleTime: 60 * 1000,
  });
};

export const usePayrollTrends = (orgId: string) => {
  return useQuery<{ month: string; totalAmount: string }[]>({
    queryKey: ["org", orgId, "analytics", "payrollTrends"],
    queryFn: async () => {
      const res = await clientFetch(`/organizations/${orgId}/analytics/payroll-trends`);
      if (!res.ok) throw new Error("Failed to fetch payroll trends");
      return res.json();
    },
    staleTime: 60 * 1000,
  });
};

export const useTreasuryFlow = (orgId: string) => {
  return useQuery<{ month: string; inflow: string; outflow: string }[]>({
    queryKey: ["org", orgId, "analytics", "treasuryFlow"],
    queryFn: async () => {
      const res = await clientFetch(`/organizations/${orgId}/analytics/treasury-flow`);
      if (!res.ok) throw new Error("Failed to fetch treasury flow");
      return res.json();
    },
    staleTime: 60 * 1000,
  });
};

export const useDepartmentSpend = (orgId: string) => {
  return useQuery<{ departmentId: string | null; departmentName: string; totalAmount: string }[]>({
    queryKey: ["org", orgId, "analytics", "departmentSpend"],
    queryFn: async () => {
      const res = await clientFetch(`/organizations/${orgId}/analytics/department-spend`);
      if (!res.ok) throw new Error("Failed to fetch department spend");
      return res.json();
    },
    staleTime: 60 * 1000,
  });
};
