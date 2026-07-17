import { useQuery } from "@tanstack/react-query";
import { clientFetch } from "@/lib/api/client";
import { PayrollRun } from "@workforceos/shared";

// Backend returns a plain array for this endpoint (matches Employees/
// Contractors' convention) — not the {data, meta} pagination envelope
// Transactions uses.
export const usePayrollRuns = (orgId: string) => {
  return useQuery<PayrollRun[]>({
    queryKey: ["org", orgId, "payrollRuns"],
    queryFn: async () => {
      const res = await clientFetch(`/organizations/${orgId}/payroll-runs`);
      if (!res.ok) throw new Error("Failed to fetch payroll runs");
      return res.json();
    },
    staleTime: 30 * 1000,
    // Chunk-by-chunk execution progress is reconciled asynchronously
    // (docs/EVENT_INDEXING.md) — poll so a run's status/progress updates
    // without a manual reload while it's executing.
    refetchInterval: 15 * 1000,
    refetchOnWindowFocus: true,
  });
};

export const usePayrollRun = (orgId: string, runId: string) => {
  return useQuery<PayrollRun>({
    queryKey: ["org", orgId, "payrollRuns", runId],
    queryFn: async () => {
      const res = await clientFetch(`/organizations/${orgId}/payroll-runs/${runId}`);
      if (!res.ok) throw new Error("Failed to fetch payroll run details");
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchInterval: 15 * 1000,
    refetchOnWindowFocus: true,
  });
};
