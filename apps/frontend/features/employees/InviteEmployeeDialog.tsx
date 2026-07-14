"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createEmployeeSchema, CreateEmployeeInput } from "@workforceos/shared";
import { PAY_FREQUENCIES } from "@workforceos/shared";
import { clientFetch } from "@/lib/api/client";
import { throwApiError } from "@/lib/api/errors";
import { useSignAndSubmit } from "@/lib/hooks/useSignAndSubmit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function InviteEmployeeDialog({ orgId }: { orgId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [summary, setSummary] = useState<CreateEmployeeInput | null>(null);
  // The submit endpoint is nested under the created employee's id
  // (POST .../employees/:employeeId/register-intent/:intentId/submit) —
  // stashed here since it's only known once buildIntent's response comes
  // back, but submitIntent needs it too.
  const createdEmployeeIdRef = useRef<string | null>(null);

  const form = useForm<CreateEmployeeInput>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: { fullName: "", email: "", walletAddress: "", salaryAmount: "", payFrequency: "MONTHLY" },
    mode: "onBlur",
  });

  const { start, SignAndSubmitModal } = useSignAndSubmit({
    title: "Register Employee on Chain",
    summaryContent: summary && (
      <div className="space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Name:</span> <span className="font-medium">{summary.fullName}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Email:</span> <span className="font-medium">{summary.email}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Salary:</span> <span className="font-medium">{summary.salaryAmount}</span></div>
      </div>
    ),
    buildIntent: async () => {
      const res = await clientFetch(`/organizations/${orgId}/employees`, {
        method: "POST",
        body: JSON.stringify(summary),
      });

      if (!res.ok) {
        await throwApiError(res, "Failed to create employee");
      }

      const { employee, intentId, unsignedXdr } = await res.json();
      if (!intentId || !unsignedXdr) {
         throw new Error("No on-chain intent returned.");
      }
      createdEmployeeIdRef.current = employee.id;
      return { intentId, unsignedXdr };
    },
    submitIntent: async (intentId, signedXdr) => {
      const res = await clientFetch(
        `/organizations/${orgId}/employees/${createdEmployeeIdRef.current}/register-intent/${intentId}/submit`,
        {
          method: "POST",
          body: JSON.stringify({ signedXdr }),
        },
      );
      if (!res.ok) {
        await throwApiError(res, "Failed to submit registration");
      }
      return res.json();
    },
    checkStatus: async () => ({ isTerminal: true, success: true }),
    queryKeysToInvalidate: [["org", orgId, "employees"]],
    onSuccess: () => {
      setIsOpen(false);
      form.reset();
    }
  });

  const onSubmit = (data: CreateEmployeeInput) => {
    setSummary(data);
    start();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger render={<Button />}>Invite Employee</DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Employee</DialogTitle>
            <DialogDescription>Create a new employee profile and register them on-chain.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input id="fullName" placeholder="Alice Smith" {...form.register("fullName")} />
                {form.formState.errors.fullName && <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="alice@example.com" {...form.register("email")} />
                {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="walletAddress">Wallet Address (Stellar)</Label>
              <Input id="walletAddress" placeholder="G..." {...form.register("walletAddress")} />
              {form.formState.errors.walletAddress && <p className="text-xs text-destructive">{form.formState.errors.walletAddress.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="salaryAmount">Salary Amount (USDC)</Label>
                <Input id="salaryAmount" placeholder="5000.00" {...form.register("salaryAmount")} />
                {form.formState.errors.salaryAmount && <p className="text-xs text-destructive">{form.formState.errors.salaryAmount.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="payFrequency">Pay Frequency</Label>
                <Select 
                  onValueChange={(val) => form.setValue("payFrequency", val as typeof PAY_FREQUENCIES[number])} 
                  defaultValue={form.getValues("payFrequency")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAY_FREQUENCIES.map((freq) => (
                      <SelectItem key={freq} value={freq}>{freq}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.payFrequency && <p className="text-xs text-destructive">{form.formState.errors.payFrequency.message}</p>}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit">Continue</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <SignAndSubmitModal />
    </>
  );
}
