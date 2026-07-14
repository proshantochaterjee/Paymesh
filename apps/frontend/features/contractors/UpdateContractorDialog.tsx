"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateContractorSchema, UpdateContractorInput, Contractor } from "@workforceos/shared";
import { clientFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";

export function UpdateContractorDialog({ orgId, contractor }: { orgId: string; contractor: Contractor }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const form = useForm<UpdateContractorInput>({
    resolver: zodResolver(updateContractorSchema),
    defaultValues: { fullName: contractor.fullName, email: contractor.email, walletAddress: contractor.walletAddress },
    mode: "onBlur",
  });

  const onSubmit = async (data: UpdateContractorInput) => {
    // Check if there are actual changes
    if (
      data.fullName === contractor.fullName &&
      data.email === contractor.email &&
      data.walletAddress === contractor.walletAddress
    ) {
      setIsOpen(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await clientFetch(`/organizations/${orgId}/contractors/${contractor.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Failed to update contractor");
      }

      queryClient.invalidateQueries({ queryKey: ["org", orgId, "contractors"] });
      queryClient.invalidateQueries({ queryKey: ["org", orgId, "contractors", contractor.id] });
      setIsOpen(false);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={<Button variant="outline" />}>Edit Details</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Contractor</DialogTitle>
          <DialogDescription>Update profile details for {contractor.fullName}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input id="fullName" {...form.register("fullName")} disabled={loading} />
            {form.formState.errors.fullName && <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...form.register("email")} disabled={loading} />
            {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="walletAddress">Wallet Address (Stellar)</Label>
            <Input id="walletAddress" {...form.register("walletAddress")} disabled={loading} />
            {form.formState.errors.walletAddress && <p className="text-xs text-destructive">{form.formState.errors.walletAddress.message}</p>}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
