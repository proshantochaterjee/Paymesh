"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { useContractors } from "./queries";
import { Contractor } from "@workforceos/shared";
import { DataTable } from "@/components/DataTable";
import { StatusBadge, DomainStatus } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Contact } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ContractorTable({ orgId }: { orgId: string }) {
  const { data, isLoading, isError, refetch } = useContractors(orgId);

  const columns = useMemo<ColumnDef<Contractor>[]>(() => [
    {
      accessorKey: "fullName",
      header: "Name",
      cell: ({ row }) => (
        <Link 
          href={`/org/${orgId}/contractors/${row.original.id}`}
          className="font-medium text-foreground hover:text-primary transition-colors"
        >
          {row.original.fullName}
        </Link>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
    },
    {
      accessorKey: "walletAddress",
      header: "Wallet",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-muted-foreground truncate max-w-[200px] inline-block">
          {row.original.walletAddress}
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
          <p className="text-destructive font-medium mb-4">Failed to load contractors</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const emptyState = (
    <div className="flex flex-col items-center py-8">
      <div className="bg-muted rounded-full p-4 mb-4">
        <Contact className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground font-medium">No contractors found.</p>
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
