"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { useEmployees } from "./queries";
import { Employee } from "@workforceos/shared";
import { DataTable } from "@/components/DataTable";
import { StatusBadge, DomainStatus } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmployeeTable({ orgId }: { orgId: string }) {
  const { data, isLoading, isError, refetch } = useEmployees(orgId);

  const columns = useMemo<ColumnDef<Employee>[]>(() => [
    {
      accessorKey: "fullName",
      header: "Name",
      cell: ({ row }) => (
        <Link 
          href={`/org/${orgId}/employees/${row.original.id}`}
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
      accessorKey: "salaryAmount",
      header: "Salary",
      cell: ({ row }) => (
        <span className="font-variant-numeric tabular-nums">
          {Number(row.original.salaryAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.original.salaryCurrency}
        </span>
      ),
    },
    {
      accessorKey: "payFrequency",
      header: "Frequency",
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
          <p className="text-destructive font-medium mb-4">Failed to load employees</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const emptyState = (
    <div className="flex flex-col items-center py-8">
      <div className="bg-muted rounded-full p-4 mb-4">
        <Users className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground font-medium">No employees found.</p>
    </div>
  );

  // If the backend returns an object with a data array (paginated), adjust this.
  // We assume an array is returned directly for simplicity per API typical list endpoints.
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
