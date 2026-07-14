import { OverviewCards } from "@/features/analytics/OverviewCards";
import { TreasuryFlowChart } from "@/features/analytics/TreasuryFlowChart";
import { PayrollTrendsChart } from "@/features/analytics/PayrollTrendsChart";
import { DepartmentSpendChart } from "@/features/analytics/DepartmentSpendChart";

export default async function AnalyticsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Organizational insights and financial trends.</p>
      </div>

      <OverviewCards orgId={orgId} />

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <TreasuryFlowChart orgId={orgId} />
        <PayrollTrendsChart orgId={orgId} />
        <DepartmentSpendChart orgId={orgId} />
      </div>
    </div>
  );
}
