import type { ExecutionContext } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainException } from "../exceptions/domain.exception";
import type { Auth } from "../../modules/auth/lib/better-auth.provider";
import { AuthGuard } from "./auth.guard";

function createContext(headers: Record<string, string>): { context: ExecutionContext; req: Record<string, unknown> } {
  const req: Record<string, unknown> = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { context, req };
}

describe("AuthGuard", () => {
  let getSession: ReturnType<typeof vi.fn>;
  let verifyJWT: ReturnType<typeof vi.fn>;
  let auth: Pick<Auth, "api">;

  beforeEach(() => {
    getSession = vi.fn();
    verifyJWT = vi.fn();
    auth = { api: { getSession, verifyJWT } as unknown as Auth["api"] };
  });

  it("attaches req.user/req.session from a valid cookie session", async () => {
    getSession.mockResolvedValue({
      user: { id: "u1", email: "a@example.com", primaryWallet: null },
      session: { token: "tok1", expiresAt: new Date("2030-01-01") },
    });
    const guard = new AuthGuard(auth as Auth);
    const { context, req } = createContext({ cookie: "better-auth.session_token=tok1" });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toEqual({ id: "u1", email: "a@example.com", primaryWallet: null });
    expect(verifyJWT).not.toHaveBeenCalled();
  });

  it("falls back to a valid Authorization: Bearer JWT when there's no session cookie", async () => {
    getSession.mockResolvedValue(null);
    verifyJWT.mockResolvedValue({ payload: { sub: "u2", email: "b@example.com", exp: 9_999_999_999 } });
    const guard = new AuthGuard(auth as Auth);
    const { context, req } = createContext({ authorization: "Bearer some.jwt.token" });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifyJWT).toHaveBeenCalledWith({ body: { token: "some.jwt.token" } });
    expect(req.user).toMatchObject({ id: "u2", email: "b@example.com" });
  });

  it("throws UNAUTHENTICATED when there's no cookie and no bearer token", async () => {
    getSession.mockResolvedValue(null);
    const guard = new AuthGuard(auth as Auth);
    const { context } = createContext({});

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    } satisfies Partial<DomainException>);
  });

  it("throws UNAUTHENTICATED when the bearer JWT fails verification (e.g. expired or bad signature)", async () => {
    getSession.mockResolvedValue(null);
    verifyJWT.mockResolvedValue({ payload: null });
    const guard = new AuthGuard(auth as Auth);
    const { context } = createContext({ authorization: "Bearer garbage" });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    } satisfies Partial<DomainException>);
  });
});
