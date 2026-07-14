"use client";

import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useTransactions, Transaction } from "./queries";
import { DataTable } from "@/components/DataTable";
import { StatusBadge, DomainStatus } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { ExternalLink, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function TransactionTable({
  orgId,
  filters = {},
  typeIn,
}: {
  orgId: string;
  filters?: Record<string, string>;
  /**
   * The backend's `type` filter only accepts a single enum value (see
   * packages/shared/src/schemas/transaction.ts) — it was never meant to
   * take a comma-joined list, which 400s every time. For "show these N
   * types" cases (e.g. Treasury's deposit/withdrawal history), fetch
   * unfiltered and narrow client-side instead, per
   * IMPLEMENTATION_PROMPT_FRONTEND.md's Treasury page spec.
   */
  typeIn?: string[];
}) {
  const { data, isLoading, isError, refetch } = useTransactions(orgId, filters);
  const rows = useMemo(() => {
    const all = data?.data || [];
    return typeIn ? all.filter((tx) => typeIn.includes(tx.type)) : all;
  }, [data, typeIn]);

  const columns = useMemo<ColumnDef<Transaction>[]>(() => [
    {
      accessorKey: "type",
      header: "Type",
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => (
        <span className="font-variant-numeric tabular-nums font-medium">
          {Number(row.original.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.original.asset}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status as DomainStatus} />,
    },
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const hash = row.original.stellarTxHash;
        if (!hash) return null;
        return (
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Explorer <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        );
      },
    },
  ], []);

  if (isError) {
    return (
      <Card className="border-destructive/50 bg-destructive/10">
        <CardContent className="flex flex-col items-center py-6 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mb-2" />
          <p className="text-destructive font-medium mb-4">Failed to load transactions</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const emptyState = (
    <div className="flex flex-col items-center py-6">
      <div className="bg-muted rounded-full p-3 mb-3">
        <ListIcon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground font-medium">No transactions found</p>
    </div>
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      isLoading={isLoading}
      emptyMessage={emptyState}
    />
  );
}

function ListIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
