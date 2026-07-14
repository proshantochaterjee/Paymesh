import { useQuery } from "@tanstack/react-query";
import { clientFetch } from "@/lib/api/client";

export interface CurrentUser {
  id: string;
  email: string | null;
  primaryWallet: string | null;
}

/** GET /auth/session — the only way to learn "who is logged in" client-side (the session cookie is httpOnly). */
export function useCurrentUser() {
  return useQuery<CurrentUser | null>({
    queryKey: ["auth", "session"],
    queryFn: async () => {
      const res = await clientFetch(`/auth/session`);
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch current user");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
