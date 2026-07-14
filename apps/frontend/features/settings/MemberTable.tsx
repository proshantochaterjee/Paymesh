"use client";

import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useMembers } from "./queries";
import { OrganizationMember } from "@workforceos/shared";
import { DataTable } from "@/components/DataTable";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Shield, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InviteMemberDialog } from "./InviteMemberDialog";
import { ChangeRoleDialog } from "./ChangeRoleDialog";
import { RemoveMemberDialog } from "./RemoveMemberDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMyRole } from "@/lib/hooks/useMyRole";

export function MemberTable({ orgId }: { orgId: string }) {
  const { data, isLoading, isError, refetch } = useMembers(orgId);
  // docs/PERMISSION_MODEL.md: inviting/changing-role/removing all need
  // ADMIN — hidden here for UX only, the backend's own @MinRole guard is
  // the real boundary regardless of what this renders.
  const { can } = useMyRole(orgId);
  const canManageMembers = can("ADMIN");

  const columns = useMemo<ColumnDef<OrganizationMember>[]>(() => [
    {
      accessorKey: "user",
      header: "Member",
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-foreground">{row.original.user.name || row.original.user.email}</div>
          {row.original.user.name && (
            <div className="text-xs text-muted-foreground">{row.original.user.email}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-1 rounded-full bg-secondary/50 text-secondary-foreground text-xs font-medium">
          {row.original.role}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        if (!canManageMembers) return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" className="h-8 w-8 p-0" />}> <span className="sr-only">Open menu</span> <MoreHorizontal className="h-4 w-4" /> </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <ChangeRoleDialog orgId={orgId} member={row.original} />
              <RemoveMemberDialog orgId={orgId} member={row.original} />
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ], [orgId, canManageMembers]);

  if (isError) {
    return (
      <Card className="border-destructive/50 bg-destructive/10">
        <CardContent className="flex flex-col items-center py-6 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mb-2" />
          <p className="text-destructive font-medium mb-4">Failed to load members</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const emptyState = (
    <div className="flex flex-col items-center py-8">
      <div className="bg-muted rounded-full p-4 mb-4">
        <Shield className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground font-medium">No members found.</p>
    </div>
  );

  const tableData = data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Team Members</h2>
        {canManageMembers && <InviteMemberDialog orgId={orgId} />}
      </div>
      <DataTable
        columns={columns}
        data={tableData}
        isLoading={isLoading}
        emptyMessage={emptyState}
      />
    </div>
  );
}
