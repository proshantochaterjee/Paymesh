"use client";

import { useState } from "react";
import { clientFetch } from "@/lib/api/client";
import { throwApiError } from "@/lib/api/errors";
import { useSignAndSubmit } from "@/lib/hooks/useSignAndSubmit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { OrganizationMember } from "@workforceos/shared";

export function RemoveMemberDialog({ orgId, member }: { orgId: string; member: OrganizationMember }) {
  const [isOpen, setIsOpen] = useState(false);

  const { start, SignAndSubmitModal } = useSignAndSubmit({
    title: "Remove Member on Chain",
    summaryContent: (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground mb-4">Revoking access is recorded securely on the blockchain. You will be prompted to sign the transaction.</p>
        <div className="flex justify-between"><span className="text-muted-foreground">User ID:</span> <span className="font-medium truncate ml-4">{member.userId}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Role:</span> <span className="font-medium">{member.role}</span></div>
      </div>
    ),
    buildIntent: async () => {
      // Backend looks this up by the OrganizationMember row's own `id`
      // (OrganizationsRepository.findMemberById), not the linked User's id.
      const res = await clientFetch(`/organizations/${orgId}/members/${member.id}/remove-intent`, {
        method: "POST",
      });

      if (!res.ok) {
        await throwApiError(res, "Failed to prepare removal");
      }

      const { intentId, unsignedXdr } = await res.json();
      return { intentId, unsignedXdr };
    },
    submitIntent: async (intentId, signedXdr) => {
      const res = await clientFetch(`/organizations/${orgId}/members/${member.id}/remove-intent/${intentId}/submit`, {
        method: "POST",
        body: JSON.stringify({ signedXdr }),
      });
      if (!res.ok) {
        await throwApiError(res, "Failed to submit removal");
      }
      return res.json();
    },
    checkStatus: async () => ({ isTerminal: true, success: true }),
    queryKeysToInvalidate: [["org", orgId, "members"]],
    onSuccess: () => {
      setIsOpen(false);
    }
  });

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger render={<Button variant="ghost" size="sm" className="w-full justify-start font-normal text-destructive hover:text-destructive" />}>Remove Member</DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Remove Member</DialogTitle>
            <DialogDescription>Are you sure you want to remove this user from the organization? They will lose all access immediately.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => start()}>Yes, Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SignAndSubmitModal />
    </>
  );
}
