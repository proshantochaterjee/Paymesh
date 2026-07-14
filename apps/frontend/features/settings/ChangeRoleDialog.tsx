"use client";

import { useState } from "react";
import { ORG_ROLES, type OrgRole } from "@workforceos/shared";
import { clientFetch } from "@/lib/api/client";
import { throwApiError } from "@/lib/api/errors";
import { useSignAndSubmit } from "@/lib/hooks/useSignAndSubmit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrganizationMember } from "@workforceos/shared";

export function ChangeRoleDialog({ orgId, member }: { orgId: string; member: OrganizationMember }) {
  const [isOpen, setIsOpen] = useState(false);
  const [newRole, setNewRole] = useState<OrgRole>(member.role);

  const { start, SignAndSubmitModal } = useSignAndSubmit({
    title: "Change Role on Chain",
    summaryContent: (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground mb-4">Modifying permissions is recorded securely on the blockchain. You will be prompted to sign the transaction.</p>
        <div className="flex justify-between"><span className="text-muted-foreground">User ID:</span> <span className="font-medium truncate ml-4">{member.userId}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Old Role:</span> <span className="font-medium">{member.role}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">New Role:</span> <span className="font-medium text-primary">{newRole}</span></div>
      </div>
    ),
    buildIntent: async () => {
      // Backend looks this up by the OrganizationMember row's own `id`
      // (OrganizationsRepository.findMemberById), not the linked User's id.
      const res = await clientFetch(`/organizations/${orgId}/members/${member.id}/role-intent`, {
        method: "POST",
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        await throwApiError(res, "Failed to prepare role change");
      }

      const { intentId, unsignedXdr } = await res.json();
      return { intentId, unsignedXdr };
    },
    submitIntent: async (intentId, signedXdr) => {
      const res = await clientFetch(`/organizations/${orgId}/members/${member.id}/role-intent/${intentId}/submit`, {
        method: "POST",
        body: JSON.stringify({ signedXdr }),
      });
      if (!res.ok) {
        await throwApiError(res, "Failed to submit role change");
      }
      return res.json();
    },
    checkStatus: async () => ({ isTerminal: true, success: true }),
    queryKeysToInvalidate: [["org", orgId, "members"]],
    onSuccess: () => {
      setIsOpen(false);
    }
  });

  const onSubmit = () => {
    if (newRole === member.role) {
      setIsOpen(false);
      return;
    }
    start();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger render={<Button variant="ghost" size="sm" className="w-full justify-start font-normal" />}>Change Role</DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>Modify access permissions for this user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Select onValueChange={(val) => setNewRole(val as OrgRole)} defaultValue={newRole}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {ORG_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={onSubmit} disabled={newRole === member.role}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SignAndSubmitModal />
    </>
  );
}
