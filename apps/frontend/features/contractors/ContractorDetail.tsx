"use client";

import { useContractor } from "./queries";
import { UpdateContractorDialog } from "./UpdateContractorDialog";
import { StatusBadge, DomainStatus } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, User, Mail, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function ContractorDetail({ orgId, contractorId }: { orgId: string; contractorId: string }) {
  const { data: contractor, isLoading, isError, refetch } = useContractor(orgId, contractorId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full max-w-sm" />
            <Skeleton className="h-4 w-full max-w-sm" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !contractor) {
    return (
      <div className="space-y-6">
        <Link href={`/org/${orgId}/contractors`} className="flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Contractors
        </Link>
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex flex-col items-center py-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <p className="text-destructive font-medium mb-4">Failed to load contractor details</p>
            <Button variant="outline" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/org/${orgId}/contractors`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Contractors
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="bg-primary/10 p-3 rounded-full">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{contractor.fullName}</h1>
              <div className="flex items-center mt-1 space-x-3 text-sm text-muted-foreground">
                <span className="flex items-center"><Mail className="mr-1 h-3 w-3" /> {contractor.email}</span>
                <StatusBadge status={contractor.status as DomainStatus} />
              </div>
            </div>
          </div>
          <UpdateContractorDialog orgId={orgId} contractor={contractor} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Profile Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Status</div>
              <div className="font-medium">{contractor.status}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Wallet Address</div>
              <div className="font-mono text-sm break-all flex items-center">
                <Wallet className="mr-2 h-4 w-4 text-muted-foreground" />
                {contractor.walletAddress}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
