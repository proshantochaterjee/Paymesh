import type { Request, Response } from "express";

/**
 * Better Auth's `auth.api.*` methods speak the Fetch API's `Headers`, not
 * Express's plain header object — this is the only place that bridges the
 * two (docs/BACKEND_ARCHITECTURE.md §1: framework-adapter concerns stay out
 * of services).
 */
export function toFetchHeaders(req: Request): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

/** Copies every `Set-Cookie` header Better Auth produced onto the Express response. */
export function applySetCookies(res: Response, authHeaders: Headers): void {
  const setCookie = authHeaders.getSetCookie();
  if (setCookie.length > 0) res.setHeader("Set-Cookie", setCookie);
}
