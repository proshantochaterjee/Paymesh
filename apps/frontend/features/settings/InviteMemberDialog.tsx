"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addMemberSchema, AddMemberInput } from "@workforceos/shared";
import { ORG_ROLES } from "@workforceos/shared";
import { clientFetch } from "@/lib/api/client";
import { throwApiError } from "@/lib/api/errors";
import { useSignAndSubmit } from "@/lib/hooks/useSignAndSubmit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function InviteMemberDialog({ orgId }: { orgId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [summary, setSummary] = useState<AddMemberInput | null>(null);

  const form = useForm<AddMemberInput>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { email: "", role: "VIEWER" },
    mode: "onBlur",
  });

  const { start, SignAndSubmitModal } = useSignAndSubmit({
    title: "Invite Member on Chain",
    summaryContent: summary && (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground mb-4">Granting access is recorded securely on the blockchain. You will be prompted to sign the transaction.</p>
        <div className="flex justify-between"><span className="text-muted-foreground">Email:</span> <span className="font-medium">{summary.email}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Role:</span> <span className="font-medium">{summary.role}</span></div>
      </div>
    ),
    buildIntent: async () => {
      const res = await clientFetch(`/organizations/${orgId}/members/add-intent`, {
        method: "POST",
        body: JSON.stringify(summary),
      });

      if (!res.ok) {
        await throwApiError(res, "Failed to prepare invitation");
      }
      
      const { intentId, unsignedXdr } = await res.json();
      return { intentId, unsignedXdr };
    },
    submitIntent: async (intentId, signedXdr) => {
      const res = await clientFetch(`/organizations/${orgId}/members/add-intent/${intentId}/submit`, {
        method: "POST",
        body: JSON.stringify({ signedXdr }),
      });
      if (!res.ok) {
        await throwApiError(res, "Failed to submit invitation");
      }
      return res.json();
    },
    checkStatus: async () => ({ isTerminal: true, success: true }),
    queryKeysToInvalidate: [["org", orgId, "members"]],
    onSuccess: () => {
      setIsOpen(false);
      form.reset();
    }
  });

  const onSubmit = (data: AddMemberInput) => {
    setSummary(data);
    start();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger render={<Button />}>Invite Member</DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Organization Member</DialogTitle>
            <DialogDescription>Add a new team member and grant them permissions.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="user@example.com" {...form.register("email")} />
              {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select 
                onValueChange={(val) => form.setValue("role", val as typeof ORG_ROLES[number])} 
                defaultValue={form.getValues("role")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ORG_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.role && <p className="text-xs text-destructive">{form.formState.errors.role.message}</p>}
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
