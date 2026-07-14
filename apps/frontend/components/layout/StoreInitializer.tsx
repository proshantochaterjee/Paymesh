"use client";

import { useEffect, useRef } from "react";
import { useUiStore } from "@/lib/store/ui";

export function StoreInitializer({ orgId }: { orgId: string }) {
  const setLastOrgId = useUiStore((state) => state.setLastOrgId);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      setLastOrgId(orgId);
      initialized.current = true;
    }
  }, [orgId, setLastOrgId]);

  return null;
}
