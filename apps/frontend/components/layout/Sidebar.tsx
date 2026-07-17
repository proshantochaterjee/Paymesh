"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUiStore } from "@/lib/store/ui";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Wallet, Users, Contact, Banknote,
  Map, List, LineChart, Settings, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo, LogoMark } from "@/components/Logo";

interface SidebarProps {
  orgId: string;
}

export function Sidebar({ orgId }: SidebarProps) {
  const { sidebarCollapsed, setSidebarCollapsed, mobileNavOpen, setMobileNavOpen } = useUiStore();
  const pathname = usePathname();
  // The persisted collapse-to-rail preference is a desktop density
  // choice; below `md` the sidebar is an off-canvas drawer that must
  // always render fully expanded (icons + labels) regardless of that
  // preference, so it's only honored once the real viewport is desktop.
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const collapsed = isDesktop && sidebarCollapsed;

  const navItems = [
    { name: "Dashboard", href: `/org/${orgId}/dashboard`, icon: LayoutDashboard },
    { name: "Treasury", href: `/org/${orgId}/treasury`, icon: Wallet },
    { name: "Employees", href: `/org/${orgId}/employees`, icon: Users },
    { name: "Contractors", href: `/org/${orgId}/contractors`, icon: Contact },
    { name: "Payroll", href: `/org/${orgId}/payroll`, icon: Banknote },
    { name: "Milestones", href: `/org/${orgId}/milestones`, icon: Map },
    { name: "Transactions", href: `/org/${orgId}/transactions`, icon: List },
    { name: "Analytics", href: `/org/${orgId}/analytics`, icon: LineChart },
    { name: "Wallet Demo", href: "/wallet", icon: Wallet },
  ];

  return (
    <>
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-card transition-transform duration-200",
          "md:relative md:z-auto md:translate-x-0 md:bg-card/60 md:transition-[width] md:duration-200",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "md:w-16" : "md:w-60",
        )}
      >
      <div className={cn("flex h-14 items-center border-b border-border", collapsed ? "justify-center px-0" : "justify-between px-4")}>
        {collapsed ? <LogoMark className="h-5 w-5" /> : <Logo />}
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSidebarCollapsed(true)}
            className="text-muted-foreground"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="flex h-9 items-center justify-center text-muted-foreground hover:text-foreground"
          title="Expand sidebar"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname?.startsWith(item.href) || false;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileNavOpen(false)}
              className={cn(
                "flex items-center rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                collapsed && "justify-center px-0",
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className={cn("h-4 w-4", !collapsed && "mr-2.5")} />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="px-2.5 pb-3">
        <Link
          href={`/org/${orgId}/settings`}
          onClick={() => setMobileNavOpen(false)}
          className={cn(
            "flex items-center rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
            pathname?.startsWith(`/org/${orgId}/settings`)
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
          title={collapsed ? "Settings" : undefined}
        >
          <Settings className={cn("h-4 w-4", !collapsed && "mr-2.5")} />
          {!collapsed && <span>Settings</span>}
        </Link>
      </div>
      </aside>
    </>
  );
}
