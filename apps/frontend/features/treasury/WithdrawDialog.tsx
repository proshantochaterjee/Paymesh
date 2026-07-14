"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { withdrawIntentSchema, WithdrawIntentInput } from "@workforceos/shared";
import { clientFetch } from "@/lib/api/client";
import { throwApiError } from "@/lib/api/errors";
import { useSignAndSubmit } from "@/lib/hooks/useSignAndSubmit";
import { useWalletStore } from "@/lib/store/wallet";
import walletAdapter from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WithdrawDialog({ orgId }: { orgId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { address, setAddress } = useWalletStore();
  const [summary, setSummary] = useState<{ amount: string; to: string } | null>(null);

  const form = useForm<WithdrawIntentInput>({
    resolver: zodResolver(withdrawIntentSchema),
    defaultValues: { amount: "", toAddress: "", callerAddress: address || "" },
    mode: "onBlur",
  });

  const { start, SignAndSubmitModal } = useSignAndSubmit({
    title: "Withdraw Funds",
    summaryContent: summary && (
      <div className="space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Amount:</span> <span className="font-medium">{summary.amount} USDC</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">To:</span> <span className="font-mono truncate ml-4">{summary.to}</span></div>
      </div>
    ),
    buildIntent: async () => {
      let currentAddress = address;
      if (!currentAddress) {
        const connected = await walletAdapter.connect();
        currentAddress = connected.address;
        setAddress(currentAddress);
      }
      
      const payload: WithdrawIntentInput = {
        amount: summary!.amount,
        toAddress: summary!.to,
        callerAddress: currentAddress,
      };

      const res = await clientFetch(`/organizations/${orgId}/treasury/withdraw-intent`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        await throwApiError(res, "Failed to build withdraw intent");
      }
      return res.json();
    },
    submitIntent: async (intentId, signedXdr) => {
      const res = await clientFetch(`/organizations/${orgId}/treasury/withdraw-intent/${intentId}/submit`, {
        method: "POST",
        body: JSON.stringify({ signedXdr }),
      });
      if (!res.ok) {
        await throwApiError(res, "Failed to submit withdrawal");
      }
      return res.json();
    },
    checkStatus: async () => {
      return { isTerminal: true, success: true };
    },
    queryKeysToInvalidate: [["org", orgId, "treasury"], ["org", orgId, "transactions"]],
    onSuccess: () => {
      setIsOpen(false);
      form.reset();
    }
  });

  const onSubmit = (data: WithdrawIntentInput) => {
    setSummary({ amount: data.amount, to: data.toAddress });
    start();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger render={<Button variant="outline" />}>Withdraw</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw from Treasury</DialogTitle>
            <DialogDescription>Transfer USDC from the organization&apos;s treasury to a wallet.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (USDC)</Label>
              <Input id="amount" type="text" placeholder="0.00" {...form.register("amount")} />
              {form.formState.errors.amount && <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="toAddress">Destination Address</Label>
              <Input id="toAddress" type="text" placeholder="G..." {...form.register("toAddress")} />
              {form.formState.errors.toAddress && <p className="text-xs text-destructive">{form.formState.errors.toAddress.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" variant="destructive">Continue</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <SignAndSubmitModal />
    </>
  );
}
