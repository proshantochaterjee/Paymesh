"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/features/settings/queries";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { useMyRole } from "@/lib/hooks/useMyRole";
import { clientFetch } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LogOut, User } from "lucide-react";

export function Topbar({ orgId }: { orgId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: org, isLoading: isOrgLoading } = useOrganization(orgId);
  const { data: currentUser } = useCurrentUser();
  const { role } = useMyRole(orgId);

  const handleLogout = async () => {
    await clientFetch("/auth/logout", { method: "POST" });
    queryClient.clear();
    router.push("/login");
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/40 px-6">
      <div className="flex items-center gap-2 min-w-0">
        {isOrgLoading ? (
          <Skeleton className="h-4 w-32" />
        ) : (
          <span className="truncate text-sm font-medium text-foreground">{org?.name}</span>
        )}
        <span className="shrink-0 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning">
          Testnet
        </span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary">
                <User className="h-3.5 w-3.5" />
              </span>
              <span className="max-w-40 truncate">{currentUser?.email || "Account"}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="truncate text-sm font-medium text-foreground">{currentUser?.email}</div>
            {role && <div className="text-xs text-muted-foreground">Role: {role}</div>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
