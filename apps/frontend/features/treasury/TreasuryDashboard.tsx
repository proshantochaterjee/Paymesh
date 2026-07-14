"use client";

import { useTreasury } from "./queries";
import { DepositDialog } from "./DepositDialog";
import { WithdrawDialog } from "./WithdrawDialog";
import { TransactionTable } from "@/features/transactions/TransactionTable";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMyRole } from "@/lib/hooks/useMyRole";

export function TreasuryDashboard({ orgId }: { orgId: string }) {
  const { data, isLoading, isError, refetch } = useTreasury(orgId);
  // docs/PERMISSION_MODEL.md: deposit needs FINANCE, withdraw needs ADMIN —
  // hidden here for UX only, the backend's own @MinRole guard is the real
  // boundary regardless of what this renders.
  const { can } = useMyRole(orgId);

  const renderContent = () => {
    if (isLoading) {
      return (
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32 mb-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </CardContent>
        </Card>
      );
    }

    if (isError) {
      return (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex flex-col items-center py-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <p className="text-destructive font-medium mb-4">Failed to load treasury data</p>
            <Button variant="outline" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Available Balance</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold font-variant-numeric tabular-nums">
            {Number(data?.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {data?.currency || "USDC"}
          </div>
          <div className="mt-2 text-sm text-muted-foreground flex items-center justify-between">
            <span>Pending Obligations</span>
            <span className="font-medium font-variant-numeric tabular-nums">
              {Number(data?.pendingObligations || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {data?.currency || "USDC"}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Treasury</h1>
          <p className="text-muted-foreground">Manage your organization&apos;s funds and view transaction history.</p>
        </div>
        <div className="flex space-x-2">
          {can("FINANCE") && <DepositDialog orgId={orgId} />}
          {can("ADMIN") && <WithdrawDialog orgId={orgId} />}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {renderContent()}
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Recent Transactions</h2>
        <TransactionTable orgId={orgId} typeIn={["DEPOSIT", "WITHDRAWAL"]} />
      </div>
    </div>
  );
}
