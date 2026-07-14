"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { useMilestones } from "./queries";
import { Milestone } from "@workforceos/shared";
import { DataTable } from "@/components/DataTable";
import { StatusBadge, DomainStatus } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Target } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MilestoneTable({ orgId }: { orgId: string }) {
  const { data, isLoading, isError, refetch } = useMilestones(orgId);

  const columns = useMemo<ColumnDef<Milestone>[]>(() => [
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <Link 
          href={`/org/${orgId}/milestones/${row.original.id}`}
          className="font-medium text-foreground hover:text-primary transition-colors"
        >
          {row.original.title}
        </Link>
      ),
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => (
        <span className="font-variant-numeric tabular-nums">
          {Number(row.original.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status as DomainStatus} />,
    },
  ], [orgId]);

  if (isError) {
    return (
      <Card className="border-destructive/50 bg-destructive/10">
        <CardContent className="flex flex-col items-center py-6 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mb-2" />
          <p className="text-destructive font-medium mb-4">Failed to load milestones</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const emptyState = (
    <div className="flex flex-col items-center py-8">
      <div className="bg-muted rounded-full p-4 mb-4">
        <Target className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground font-medium">No milestones found.</p>
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
