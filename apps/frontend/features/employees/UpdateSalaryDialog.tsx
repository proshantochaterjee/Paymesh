"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateEmployeeSchema, UpdateEmployeeInput, Employee } from "@workforceos/shared";
import { PAY_FREQUENCIES } from "@workforceos/shared";
import { clientFetch } from "@/lib/api/client";
import { throwApiError } from "@/lib/api/errors";
import { useSignAndSubmit } from "@/lib/hooks/useSignAndSubmit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function UpdateSalaryDialog({ orgId, employee }: { orgId: string; employee: Employee }) {
  const [isOpen, setIsOpen] = useState(false);
  const [summary, setSummary] = useState<UpdateEmployeeInput | null>(null);

  const form = useForm<UpdateEmployeeInput>({
    resolver: zodResolver(updateEmployeeSchema),
    defaultValues: { 
      salaryAmount: employee.salaryAmount, 
      payFrequency: employee.payFrequency 
    },
    mode: "onBlur",
  });

  const { start, SignAndSubmitModal } = useSignAndSubmit({
    title: "Update Salary on Chain",
    summaryContent: summary && (
      <div className="space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">New Salary:</span> <span className="font-medium">{summary.salaryAmount} USDC</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">New Frequency:</span> <span className="font-medium">{summary.payFrequency}</span></div>
      </div>
    ),
    buildIntent: async () => {
      const res = await clientFetch(`/organizations/${orgId}/employees/${employee.id}`, {
        method: "PATCH",
        body: JSON.stringify(summary),
      });

      if (!res.ok) {
        await throwApiError(res, "Failed to prepare update");
      }
      
      const { intentId, unsignedXdr } = await res.json();
      if (!intentId || !unsignedXdr) {
         // If no intent was returned, the backend handled it without chain action (e.g. only postgres changes like department).
         // The hook handles returning null gracefully as complete.
         return null;
      }
      return { intentId, unsignedXdr };
    },
    submitIntent: async (intentId, signedXdr) => {
      const res = await clientFetch(`/organizations/${orgId}/employees/${employee.id}/update-intent/${intentId}/submit`, {
        method: "POST",
        body: JSON.stringify({ signedXdr }),
      });
      if (!res.ok) {
        await throwApiError(res, "Failed to submit update");
      }
      return res.json();
    },
    checkStatus: async () => ({ isTerminal: true, success: true }),
    queryKeysToInvalidate: [
      ["org", orgId, "employees"], 
      ["org", orgId, "employees", employee.id]
    ],
    onSuccess: () => {
      setIsOpen(false);
      form.reset({
        salaryAmount: summary?.salaryAmount || employee.salaryAmount,
        payFrequency: summary?.payFrequency || employee.payFrequency,
      });
    }
  });

  const onSubmit = (data: UpdateEmployeeInput) => {
    // Only proceed if there's an actual change
    if (data.salaryAmount === employee.salaryAmount && data.payFrequency === employee.payFrequency) {
      setIsOpen(false);
      return;
    }
    setSummary(data);
    start();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger render={<Button variant="outline" />}>Update Salary</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Employee Salary</DialogTitle>
            <DialogDescription>Modify compensation details for {employee.fullName}. Changes require an on-chain signature.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
