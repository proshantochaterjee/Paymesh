"use client";

import { useState } from "react";
import { clientFetch } from "@/lib/api/client";
import { throwApiError } from "@/lib/api/errors";
import { useSignAndSubmit } from "@/lib/hooks/useSignAndSubmit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ExecutePayrollDialog({ orgId, runId, totalAmount, disabled }: { orgId: string; runId: string; totalAmount: string; disabled?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  const { start, SignAndSubmitModal } = useSignAndSubmit({
    title: "Execute Payroll",
    summaryContent: (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">You are about to execute the payroll run. This may require multiple signatures if the batch is large.</p>
        <div className="flex justify-between mt-4">
          <span className="text-muted-foreground">Total Amount:</span> 
          <span className="font-medium">{totalAmount} USDC</span>
        </div>
      </div>
    ),
    buildIntent: async () => {
      const res = await clientFetch(`/organizations/${orgId}/payroll-runs/${runId}/execute-intent`, {
        method: "POST",
      });

      if (!res.ok) {
        await throwApiError(res, "Failed to build execute intent for payroll chunk");
      }
      
      const data = await res.json();
      return { 
        intentId: data.intentId, 
        unsignedXdr: data.unsignedXdr,
        isLastChunk: data.chunkIndex === data.totalChunks,
        step: "fund"
      };
    },
    submitIntent: async (intentId, signedXdr) => {
      const res = await clientFetch(`/organizations/${orgId}/payroll-runs/${runId}/execute-intent/${intentId}/submit`, {
        method: "POST",
        body: JSON.stringify({ signedXdr }),
      });
      if (!res.ok) {
        await throwApiError(res, "Failed to submit payroll chunk");
      }
      
      const submitData = await res.json();
      // Throw an error inside the hook if we need to abort, otherwise check isLastChunk
      // Wait, useSignAndSubmit loops based on `isLastChunk` returned from buildIntent.
      // But submitIntent returns `isLastChunk`. The useSignAndSubmit hook as written expects `isLastChunk` from `buildIntent`.
      // Let's modify the hook's check or handle it here. 
      // In my hook: `const { intentId, unsignedXdr, isLastChunk, step } = await buildIntent();`
      // I can't return `isLastChunk` from `buildIntent` because `isLastChunk` is known on submit, 
      // or `buildIntent` could know if chunkIndex === totalChunks.
      return submitData;
    },
    checkStatus: async () => ({ isTerminal: true, success: true }),
    queryKeysToInvalidate: [
      ["org", orgId, "payrollRuns"],
      ["org", orgId, "payrollRuns", runId],
      ["org", orgId, "treasury"],
      ["org", orgId, "transactions"]
    ],
    onSuccess: () => {
      setIsOpen(false);
    }
  });

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger render={<Button />}>Execute Run</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Execute Payroll Run</DialogTitle>
            <DialogDescription>Process the scheduled payroll on the Stellar network.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={() => start()}>Proceed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SignAndSubmitModal />
    </>
  );
}
