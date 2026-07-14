"use client";

import { useState } from "react";
import { usePayrollRuns } from "./queries";
import { CreateRunDialog } from "./CreateRunDialog";
import { ExecutePayrollDialog } from "./ExecutePayrollDialog";
import { PayrollHistoryTable } from "./PayrollHistoryTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Calendar, DollarSign, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clientFetch } from "@/lib/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBadge, DomainStatus } from "@/components/StatusBadge";

export function PayrollDashboard({ orgId }: { orgId: string }) {
  const { data, isLoading, isError, refetch } = usePayrollRuns(orgId);
  const queryClient = useQueryClient();
  const [scheduling, setScheduling] = useState(false);

  const handleSchedule = async (runId: string) => {
    setScheduling(true);
    try {
      const res = await clientFetch(`/organizations/${orgId}/payroll-runs/${runId}/schedule`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to schedule run");
      queryClient.invalidateQueries({ queryKey: ["org", orgId, "payrollRuns"] });
    } catch (err) {
      console.error(err);
      alert("Failed to schedule payroll run.");
    } finally {
      setScheduling(false);
    }
  };

  const renderMetrics = () => {
    if (isLoading) {
      return (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-32" /></CardContent>
            </Card>
          ))}
        </div>
      );
    }

    if (isError) {
      return (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex flex-col items-center py-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <p className="text-destructive font-medium mb-4">Failed to load payroll data</p>
            <Button variant="outline" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      );
    }

    const runs = data || [];
    const pendingRuns = runs.filter(r => r.status === "DRAFT" || r.status === "SCHEDULED");
    const nextRun = pendingRuns.sort((a, b) => new Date(a.payPeriodStart).getTime() - new Date(b.payPeriodStart).getTime())[0];
    
    // Sort runs for history table (newest first)
    // Actually, PayrollHistoryTable will do it or backend does it.

    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Next Run Status</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {nextRun ? (
              <div className="flex items-center space-x-2 mt-1">
                <StatusBadge status={nextRun.status as DomainStatus} />
              </div>
            ) : (
              <div className="text-xl font-medium text-muted-foreground mt-1">No Pending Runs</div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Next Run Period</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {nextRun ? (
              <div className="text-xl font-bold">
                {new Date(nextRun.payPeriodStart).toLocaleDateString()} - {new Date(nextRun.payPeriodEnd).toLocaleDateString()}
              </div>
            ) : (
              <div className="text-xl font-medium text-muted-foreground">-</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Next Run Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {nextRun ? (
              <div className="text-2xl font-bold font-variant-numeric tabular-nums">
                {Number(nextRun.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
              </div>
            ) : (
              <div className="text-2xl font-medium text-muted-foreground">-</div>
            )}
          </CardContent>
        </Card>

        {/* Action Panel */}
        {nextRun && (
          <div className="md:col-span-3 flex items-center justify-end space-x-2 p-4 bg-muted/50 rounded-lg border border-border">
            <span className="text-sm text-muted-foreground mr-auto">
              Action Required: {nextRun.status === "DRAFT" ? "Review and schedule this run." : "Execute this run to pay employees."}
            </span>
            {nextRun.status === "DRAFT" && (
              <Button onClick={() => handleSchedule(nextRun.id)} disabled={scheduling}>
                {scheduling ? "Scheduling..." : "Schedule Run"}
              </Button>
            )}
            {(nextRun.status === "SCHEDULED" || nextRun.status === "EXECUTING") && (
              <ExecutePayrollDialog orgId={orgId} runId={nextRun.id} totalAmount={nextRun.totalAmount} />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">Manage and execute organizational payroll runs.</p>
        </div>
        <div className="flex space-x-2">
          <CreateRunDialog orgId={orgId} />
        </div>
      </div>

      {renderMetrics()}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Past Runs</h2>
        <PayrollHistoryTable orgId={orgId} />
      </div>
    </div>
  );
}
