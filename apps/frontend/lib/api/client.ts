const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

export async function clientFetch(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    // The backend runs on a different origin in dev (localhost:3001 vs
    // this app's localhost:3000) — without `credentials: "include"`, the
    // browser never attaches the Better Auth session cookie to a
    // cross-origin request, so every authenticated call would 401 even
    // with CORS otherwise configured correctly.
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  return res;
}
