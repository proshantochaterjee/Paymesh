import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";

import { DomainException } from "../exceptions/domain.exception";
import { AUTH_INSTANCE } from "../../modules/auth/lib/auth.constants";
import type { Auth } from "../../modules/auth/lib/better-auth.provider";
import { toFetchHeaders } from "../../modules/auth/lib/http-bridge";
import type { AuthenticatedRequest } from "../types/authenticated-request";

/**
 * docs/BACKEND_ARCHITECTURE.md §3: validates the caller's session or bearer
 * JWT and attaches `req.user`/`req.session` — deferred from Step 5 since it
 * needs the Better Auth instance built in Step 7. Accepts either the
 * httpOnly session cookie (browser clients) or an `Authorization: Bearer
 * <jwt>` access token (docs/AUTHENTICATION.md §4).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH_INSTANCE) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const headers = toFetchHeaders(req);

    const cookieSession = await this.auth.api.getSession({ headers });
    if (cookieSession) {
      req.user = {
        id: cookieSession.user.id,
        email: cookieSession.user.email ?? null,
        primaryWallet: (cookieSession.user as { primaryWallet?: string | null }).primaryWallet ?? null,
      };
      req.session = { token: cookieSession.session.token, expiresAt: cookieSession.session.expiresAt };
      return true;
    }

    const authorization = req.headers.authorization;
    if (authorization?.startsWith("Bearer ")) {
      const token = authorization.slice("Bearer ".length);
      const { payload } = await this.auth.api.verifyJWT({ body: { token } });
      if (payload) {
        req.user = {
          id: payload.sub,
          email: typeof payload.email === "string" ? payload.email : null,
          primaryWallet: typeof payload.primaryWallet === "string" ? payload.primaryWallet : null,
        };
        req.session = { token, expiresAt: new Date((payload.exp ?? 0) * 1000) };
        return true;
      }
    }

    throw new DomainException("UNAUTHENTICATED", "Sign in required.");
  }
}
