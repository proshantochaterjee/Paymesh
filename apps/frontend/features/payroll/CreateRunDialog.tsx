"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createPayrollRunSchema, CreatePayrollRunInput } from "@workforceos/shared";
import { useEmployees } from "@/features/employees/queries";
import { clientFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";

export function CreateRunDialog({ orgId }: { orgId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: employees } = useEmployees(orgId);

  const form = useForm<CreatePayrollRunInput>({
    // `as any`: createPayrollRunSchema's `z.coerce.date()` fields make zodResolver's
    // inferred input/output types diverge just enough that this version combo
    // (Zod 4 + @hookform/resolvers) can't unify them — a known ecosystem
    // friction point with z.coerce, not a real type-safety hole here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createPayrollRunSchema) as any,
    defaultValues: { 
      payPeriodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1), 
      payPeriodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
      employeeIds: [] 
    },
    mode: "onBlur",
  });

  const onSubmit = async (data: CreatePayrollRunInput) => {
    // Frontend convenience: populate employeeIds with all active employees if empty
    const submitData = { ...data };
    if (!submitData.employeeIds || submitData.employeeIds.length === 0) {
       const activeEmployees = (employees || []).filter(e => e.status === "ACTIVE" && e.onChainEmployeeId);
       if (activeEmployees.length === 0) {
         setError("No active employees with registered on-chain profiles found.");
         return;
       }
       submitData.employeeIds = activeEmployees.map(e => e.id);
    }

    setLoading(true);
    setError(null);
    try {
      const res = await clientFetch(`/organizations/${orgId}/payroll-runs`, {
        method: "POST",
        body: JSON.stringify(submitData),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Failed to create payroll run");
      }

      queryClient.invalidateQueries({ queryKey: ["org", orgId, "payrollRuns"] });
      setIsOpen(false);
      form.reset();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={<Button />}>New Payroll Run</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Payroll Run</DialogTitle>
          <DialogDescription>Generates a draft payroll run for all active employees.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="payPeriodStart">Period Start</Label>
              <Input 
                id="payPeriodStart" 
                type="date" 
                {...form.register("payPeriodStart")} 
                disabled={loading} 
              />
              {form.formState.errors.payPeriodStart && <p className="text-xs text-destructive">{form.formState.errors.payPeriodStart.message as string}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="payPeriodEnd">Period End</Label>
              <Input 
                id="payPeriodEnd" 
                type="date" 
                {...form.register("payPeriodEnd")} 
                disabled={loading} 
              />
              {form.formState.errors.payPeriodEnd && <p className="text-xs text-destructive">{form.formState.errors.payPeriodEnd.message as string}</p>}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Creating..." : "Create Run"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
