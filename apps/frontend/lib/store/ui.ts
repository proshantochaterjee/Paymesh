import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  // Mobile off-canvas drawer visibility — deliberately not persisted
  // (unlike sidebarCollapsed): it should always start closed on a fresh
  // page load, never restored open from a previous session.
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  lastOrgId: string | null;
  setLastOrgId: (orgId: string | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      mobileNavOpen: false,
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
      lastOrgId: null,
      setLastOrgId: (orgId) => set({ lastOrgId: orgId }),
    }),
    {
      name: "ui-store",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        lastOrgId: state.lastOrgId
      }),
    }
  )
);
