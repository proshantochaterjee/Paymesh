"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createContractorSchema, CreateContractorInput } from "@workforceos/shared";
import { clientFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";

export function InviteContractorDialog({ orgId }: { orgId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const form = useForm<CreateContractorInput>({
    resolver: zodResolver(createContractorSchema),
    defaultValues: { fullName: "", email: "", walletAddress: "" },
    mode: "onBlur",
  });

  const onSubmit = async (data: CreateContractorInput) => {
    setLoading(true);
    setError(null);
    try {
      const res = await clientFetch(`/organizations/${orgId}/contractors`, {
        method: "POST",
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Failed to create contractor");
      }

      queryClient.invalidateQueries({ queryKey: ["org", orgId, "contractors"] });
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
      <DialogTrigger render={<Button />}>Add Contractor</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Contractor</DialogTitle>
          <DialogDescription>Create a new contractor profile to assign milestones.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input id="fullName" placeholder="Bob Jones" {...form.register("fullName")} disabled={loading} />
            {form.formState.errors.fullName && <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="bob@example.com" {...form.register("email")} disabled={loading} />
            {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="walletAddress">Wallet Address (Stellar)</Label>
            <Input id="walletAddress" placeholder="G..." {...form.register("walletAddress")} disabled={loading} />
            {form.formState.errors.walletAddress && <p className="text-xs text-destructive">{form.formState.errors.walletAddress.message}</p>}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Create Contractor"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
