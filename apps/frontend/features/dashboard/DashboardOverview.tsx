"use client";

import Link from "next/link";
import { useAnalyticsOverview } from "@/features/analytics/queries";
import { useMilestones } from "@/features/milestones/queries";
import { useEmployees } from "@/features/employees/queries";
import { TreasuryFlowChart } from "@/features/analytics/TreasuryFlowChart";
import { PayrollTrendsChart } from "@/features/analytics/PayrollTrendsChart";
import { TransactionTable } from "@/features/transactions/TransactionTable";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, Users, TrendingDown, Target, ArrowUpRight, Sparkles } from "lucide-react";

const OPEN_MILESTONE_STATUSES = ["DRAFT", "FUNDED", "APPROVED"];

function formatUsdc(value: string | number | undefined) {
  return `${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;
}

export function DashboardOverview({ orgId }: { orgId: string }) {
  const { data: overview, isLoading: isOverviewLoading } = useAnalyticsOverview(orgId);
  const { data: milestones, isLoading: isMilestonesLoading } = useMilestones(orgId);
  const { data: employees, isLoading: isEmployeesLoading } = useEmployees(orgId);

  const openMilestones = (milestones || []).filter((m) => OPEN_MILESTONE_STATUSES.includes(m.status));
  const openMilestoneValue = openMilestones.reduce((sum, m) => sum + Number(m.amount), 0);

  const isBrandNew = !isEmployeesLoading && !isMilestonesLoading && (employees?.length ?? 0) === 0 && (milestones?.length ?? 0) === 0 && Number(overview?.treasuryBalance || 0) === 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">An overview of your organization&apos;s treasury, headcount, and payroll activity.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Treasury Balance"
          value={formatUsdc(overview?.treasuryBalance)}
          hint="Live from Stellar network"
          icon={Wallet}
          isLoading={isOverviewLoading}
        />
        <StatTile
          label="Active Headcount"
          value={overview?.headcount ?? 0}
          hint="Registered employees"
          icon={Users}
          isLoading={isOverviewLoading}
        />
        <StatTile
          label="MTD Payroll Spend"
          value={formatUsdc(overview?.monthToDateSpend)}
          hint="Month to date outflows"
          icon={TrendingDown}
          isLoading={isOverviewLoading}
        />
        <StatTile
          label="Open Milestones"
          value={`${openMilestones.length}`}
          hint={`${formatUsdc(openMilestoneValue)} in escrow/pending`}
          icon={Target}
          isLoading={isMilestonesLoading}
        />
      </div>

      {isBrandNew ? (
        <Card>
          <CardContent className="py-4">
            <EmptyState
              icon={Sparkles}
              title="Welcome to your new organization"
              description="Get started by adding your first employee or funding your treasury so you can run payroll and pay contractors on-chain."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button render={<Link href={`/org/${orgId}/employees`} />} nativeButton={false}>
                    Add an employee <ArrowUpRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" render={<Link href={`/org/${orgId}/treasury`} />} nativeButton={false}>
                    Fund treasury
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <TreasuryFlowChart orgId={orgId} />
            <PayrollTrendsChart orgId={orgId} />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">Recent Transactions</h2>
              <Button variant="ghost" size="sm" render={<Link href={`/org/${orgId}/transactions`} />} nativeButton={false}>
                View all <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <TransactionTable orgId={orgId} filters={{ pageSize: "5" }} />
          </div>
        </>
      )}
    </div>
  );
}
