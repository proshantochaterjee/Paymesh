import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  lastOrgId: string | null;
  setLastOrgId: (orgId: string | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
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
