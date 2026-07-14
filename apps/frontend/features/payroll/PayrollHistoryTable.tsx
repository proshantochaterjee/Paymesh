"use client";

import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { usePayrollRuns } from "./queries";
import { PayrollRun } from "@workforceos/shared";
import { DataTable } from "@/components/DataTable";
import { StatusBadge, DomainStatus } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PayrollHistoryTable({ orgId }: { orgId: string }) {
  const { data, isLoading, isError, refetch } = usePayrollRuns(orgId);

  const columns = useMemo<ColumnDef<PayrollRun>[]>(() => [
    {
      accessorKey: "payPeriodStart",
      header: "Period",
      cell: ({ row }) => (
        <span className="font-medium">
          {new Date(row.original.payPeriodStart).toLocaleDateString()} - {new Date(row.original.payPeriodEnd).toLocaleDateString()}
        </span>
      ),
    },
    {
      accessorKey: "totalAmount",
      header: "Total Amount",
      cell: ({ row }) => (
        <span className="font-variant-numeric tabular-nums font-medium">
          {Number(row.original.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status as DomainStatus} />,
    },
  ], []);

  if (isError) {
    return (
      <Card className="border-destructive/50 bg-destructive/10">
        <CardContent className="flex flex-col items-center py-6 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mb-2" />
          <p className="text-destructive font-medium mb-4">Failed to load payroll history</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const emptyState = (
    <div className="flex flex-col items-center py-8">
      <div className="bg-muted rounded-full p-4 mb-4">
        <Calendar className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground font-medium">No payroll runs found.</p>
    </div>
  );

  const tableData = data || [];

  return (
    <DataTable
      columns={columns}
      data={tableData}
      isLoading={isLoading}
      emptyMessage={emptyState}
    />
  );
}
