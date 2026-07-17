"use client";

import { clientFetch } from "@/lib/api/client";
import { throwApiError } from "@/lib/api/errors";
import { useSignAndSubmit } from "@/lib/hooks/useSignAndSubmit";
import { Button } from "@/components/ui/button";

export function FundMilestoneButton({ orgId, milestoneId, amount }: { orgId: string; milestoneId: string; amount: string }) {
  const { start, SignAndSubmitModal } = useSignAndSubmit({
    title: "Fund Milestone",
    summaryContent: (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">Funding a milestone is a two-step on-chain process. You will be prompted to sign twice.</p>
        <div className="flex justify-between mt-4">
          <span className="text-muted-foreground">Amount:</span> 
          <span className="font-medium">{amount} USDC</span>
        </div>
      </div>
    ),
    buildIntent: async () => {
      const res = await clientFetch(`/organizations/${orgId}/milestones/${milestoneId}/fund-intent`, {
        method: "POST",
      });

      if (!res.ok) {
        await throwApiError(res, "Failed to build fund intent");
      }
      
      const data = await res.json();
      return { 
        intentId: data.intentId, 
        unsignedXdr: data.unsignedXdr,
        step: data.step // either "create" or "fund"
      };
    },
    submitIntent: async (intentId, signedXdr) => {
      const res = await clientFetch(`/organizations/${orgId}/milestones/${milestoneId}/fund-intent/${intentId}/submit`, {
        method: "POST",
        body: JSON.stringify({ signedXdr }),
      });
      if (!res.ok) {
        await throwApiError(res, "Failed to submit intent");
      }
      return res.json();
    },
    checkStatus: async () => ({ isTerminal: true, success: true }),
    queryKeysToInvalidate: [
      ["org", orgId, "milestones"],
      ["org", orgId, "milestones", milestoneId],
      ["org", orgId, "treasury"],
      ["org", orgId, "transactions"]
    ],
  });

  return (
    <>
      <Button onClick={() => start()}>Fund Milestone</Button>
      <SignAndSubmitModal />
    </>
  );
}

export function ActionMilestoneButton({ 
  orgId, 
  milestoneId, 
  action, 
  label, 
  variant = "default" 
}: { 
  orgId: string; 
  milestoneId: string; 
  action: "approve" | "release" | "cancel"; 
  label: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
}) {
  const { start, SignAndSubmitModal } = useSignAndSubmit({
    title: `${label} Milestone`,
    summaryContent: (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">Are you sure you want to {label.toLowerCase()} this milestone? This action requires an on-chain signature.</p>
      </div>
    ),
    buildIntent: async () => {
      const res = await clientFetch(`/organizations/${orgId}/milestones/${milestoneId}/${action}-intent`, {
        method: "POST",
      });

      if (!res.ok) {
        await throwApiError(res, `Failed to build ${action} intent`);
      }
      
      const data = await res.json();
      if (!data.intentId || !data.unsignedXdr) {
        // e.g. cancelling a DRAFT milestone might be Postgres-only and return no intent
        return null;
      }
      return { 
        intentId: data.intentId, 
        unsignedXdr: data.unsignedXdr,
      };
    },
    submitIntent: async (intentId, signedXdr) => {
      const res = await clientFetch(`/organizations/${orgId}/milestones/${milestoneId}/${action}-intent/${intentId}/submit`, {
        method: "POST",
        body: JSON.stringify({ signedXdr }),
      });
      if (!res.ok) {
        await throwApiError(res, `Failed to submit ${action} intent`);
      }
      return res.json();
    },
    checkStatus: async () => ({ isTerminal: true, success: true }),
    queryKeysToInvalidate: [
      ["org", orgId, "milestones"],
      ["org", orgId, "milestones", milestoneId],
      ["org", orgId, "treasury"],
      ["org", orgId, "transactions"]
    ],
  });

  return (
    <>
      <Button variant={variant} onClick={() => start()}>{label}</Button>
      <SignAndSubmitModal />
    </>
  );
}
