import { APIError } from "@better-auth/core/error";
import { Inject, Injectable } from "@nestjs/common";
import type {
  ApiErrorCode,
  LoginInput,
  RegisterInput,
  WalletChallengeInput,
  WalletVerifyInput,
} from "@workforceos/shared";
import type { Request } from "express";
import zxcvbn from "zxcvbn";

import { DomainException } from "../../common/exceptions/domain.exception";
import { AUTH_INSTANCE } from "./lib/auth.constants";
import type { Auth } from "./lib/better-auth.provider";
import { toFetchHeaders } from "./lib/http-bridge";

const MIN_ZXCVBN_SCORE = 3;

interface AuthResult<T> {
  body: T;
  headers: Headers;
}

/**
 * Known Better Auth error codes mapped to our documented ApiErrorCode
 * (docs/ERROR_HANDLING.md §2). Codes thrown by our own wallet plugin
 * (wallet-plugin.ts) already use these exact names and pass through
 * unmapped entries fall back to a status-derived code in `mapAuthError`.
 */
const BETTER_AUTH_CODE_MAP: Record<string, ApiErrorCode> = {
  INVALID_EMAIL_OR_PASSWORD: "UNAUTHENTICATED",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "EMAIL_ALREADY_REGISTERED",
  USER_ALREADY_EXISTS: "EMAIL_ALREADY_REGISTERED",
  INVALID_EMAIL: "VALIDATION_ERROR",
  INVALID_PASSWORD: "VALIDATION_ERROR",
  PASSWORD_TOO_SHORT: "VALIDATION_ERROR",
  PASSWORD_TOO_LONG: "VALIDATION_ERROR",
  CHALLENGE_EXPIRED: "CHALLENGE_EXPIRED",
  INVALID_SIGNATURE: "INVALID_SIGNATURE",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  WALLET_ALREADY_LINKED: "WALLET_ALREADY_LINKED",
};

function mapAuthError(error: unknown): never {
  if (error instanceof APIError) {
    const code = (error.body as { code?: string } | undefined)?.code;
    const mapped = code ? BETTER_AUTH_CODE_MAP[code] : undefined;
    if (mapped) throw new DomainException(mapped, error.message);

    if (error.status === "UNAUTHORIZED") throw new DomainException("UNAUTHENTICATED", error.message);
    if (error.status === "FORBIDDEN") throw new DomainException("FORBIDDEN_ROLE", error.message);
    throw new DomainException("VALIDATION_ERROR", error.message);
  }
  throw error;
}

@Injectable()
export class AuthService {
  constructor(@Inject(AUTH_INSTANCE) private readonly auth: Auth) {}

  async register(input: RegisterInput, req: Request): Promise<AuthResult<unknown>> {
    const strength = zxcvbn(input.password);
    if (strength.score < MIN_ZXCVBN_SCORE) {
      throw new DomainException(
        "VALIDATION_ERROR",
        "Password is too weak or common — choose something harder to guess.",
      );
    }

    try {
      // docs/AUTHENTICATION.md's registerSchema is email+password only;
      // Better Auth's core user schema requires `name` (see
      // docs/DEVELOPMENT_PLAN.md Step 7 spec-gap note) — derived here so
      // the public API contract stays unchanged.
      const name = input.email.split("@")[0] ?? input.email;
      const result = await this.auth.api.signUpEmail({
        body: { email: input.email, password: input.password, name },
        headers: toFetchHeaders(req),
        returnHeaders: true,
      });
      return { body: result.response, headers: result.headers };
    } catch (error) {
      mapAuthError(error);
    }
  }

  async login(input: LoginInput, req: Request): Promise<AuthResult<unknown>> {
    try {
      const result = await this.auth.api.signInEmail({
        body: { email: input.email, password: input.password },
        headers: toFetchHeaders(req),
        returnHeaders: true,
      });
      return { body: result.response, headers: result.headers };
    } catch (error) {
      mapAuthError(error);
    }
  }

  async logout(req: Request): Promise<AuthResult<unknown>> {
    try {
      const result = await this.auth.api.signOut({
        headers: toFetchHeaders(req),
        returnHeaders: true,
      });
      return { body: result.response, headers: result.headers };
    } catch (error) {
      mapAuthError(error);
    }
  }

  /** docs/AUTHENTICATION.md §4: mints a fresh 15 min bearer JWT from the caller's current session. */
  async refresh(req: Request): Promise<unknown> {
    try {
      return await this.auth.api.getToken({ headers: toFetchHeaders(req) });
    } catch (error) {
      mapAuthError(error);
    }
  }

  async walletChallenge(input: WalletChallengeInput): Promise<unknown> {
    try {
      return await this.auth.api.walletChallenge({ body: input });
    } catch (error) {
      mapAuthError(error);
    }
  }

  async walletVerify(input: WalletVerifyInput): Promise<AuthResult<unknown>> {
    try {
      const result = await this.auth.api.walletVerify({ body: input, returnHeaders: true });
      return { body: result.response, headers: result.headers };
    } catch (error) {
      mapAuthError(error);
    }
  }

  async walletLink(input: WalletVerifyInput, req: Request): Promise<unknown> {
    try {
      return await this.auth.api.walletLink({ body: input, headers: toFetchHeaders(req) });
    } catch (error) {
      mapAuthError(error);
    }
  }
}
