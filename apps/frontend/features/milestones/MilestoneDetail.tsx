"use client";

import { useMilestone } from "./queries";
import { FundMilestoneButton, ActionMilestoneButton } from "./MilestoneActions";
import { StatusBadge, DomainStatus } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Target, User, Wallet, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function MilestoneDetail({ orgId, milestoneId }: { orgId: string; milestoneId: string }) {
  const { data: milestone, isLoading, isError, refetch } = useMilestone(orgId, milestoneId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full max-w-sm" />
            <Skeleton className="h-4 w-full max-w-sm" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !milestone) {
    return (
      <div className="space-y-6">
        <Link href={`/org/${orgId}/milestones`} className="flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Milestones
        </Link>
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex flex-col items-center py-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <p className="text-destructive font-medium mb-4">Failed to load milestone details</p>
            <Button variant="outline" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/org/${orgId}/milestones`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Milestones
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="bg-primary/10 p-3 rounded-full">
              <Target className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{milestone.title}</h1>
              <div className="flex items-center mt-1 space-x-3 text-sm text-muted-foreground">
                <StatusBadge status={milestone.status as DomainStatus} />
                {milestone.onChainMilestoneId && (
                  <span className="flex items-center font-mono text-xs"><Hash className="mr-1 h-3 w-3" /> {milestone.onChainMilestoneId}</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex space-x-2">
            {milestone.status === "DRAFT" && (
              <>
                <ActionMilestoneButton orgId={orgId} milestoneId={milestoneId} action="cancel" label="Cancel" variant="outline" />
                <FundMilestoneButton orgId={orgId} milestoneId={milestoneId} amount={milestone.amount} />
              </>
            )}
            {milestone.status === "FUNDED" && (
              <>
                <ActionMilestoneButton orgId={orgId} milestoneId={milestoneId} action="cancel" label="Cancel" variant="outline" />
                <ActionMilestoneButton orgId={orgId} milestoneId={milestoneId} action="approve" label="Approve" />
              </>
            )}
            {milestone.status === "APPROVED" && (
              <>
                <ActionMilestoneButton orgId={orgId} milestoneId={milestoneId} action="cancel" label="Cancel" variant="outline" />
                <ActionMilestoneButton orgId={orgId} milestoneId={milestoneId} action="release" label="Release Funds" />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Milestone Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Amount</div>
              <div className="font-medium font-variant-numeric tabular-nums text-xl">
                {Number(milestone.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Contractor ID</div>
              <div className="font-medium flex items-center">
                <User className="mr-2 h-4 w-4 text-muted-foreground" />
                {milestone.contractorId}
              </div>
            </div>
            {milestone.description && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Description</div>
                <div className="text-sm">{milestone.description}</div>
              </div>
            )}
          </CardContent>
        </Card>

        {milestone.stellarTxHash && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Blockchain Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Latest Transaction Hash</div>
                <a 
                  href={`https://stellar.expert/explorer/testnet/tx/${milestone.stellarTxHash}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-mono text-sm text-primary hover:underline break-all flex items-center"
                >
                  <Wallet className="mr-2 h-4 w-4 text-muted-foreground" />
                  {milestone.stellarTxHash}
                </a>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
