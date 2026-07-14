import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  loginSchema,
  registerSchema,
  walletChallengeSchema,
  walletVerifySchema,
  type LoginInput,
  type RegisterInput,
  type WalletChallengeInput,
  type WalletVerifyInput,
} from "@workforceos/shared";
import type { Request, Response } from "express";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthGuard } from "../../common/guards/auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedRequest, AuthenticatedUser } from "../../common/types/authenticated-request";
import { AuthService } from "./auth.service";
import { applySetCookies } from "./lib/http-bridge";

// docs/SECURITY_MODEL.md §6: 10 req/min for *unauthenticated* /auth/*
// routes (credential-stuffing/challenge-spam surface), tighter than the
// 100 req/min global default that already covers the authenticated ones
// (logout/refresh/wallet-link) via AppModule's ThrottlerModule.forRoot.
const UNAUTHENTICATED_AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @HttpCode(200)
  @Throttle(UNAUTHENTICATED_AUTH_THROTTLE)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    const result = await this.authService.register(body, req);
    applySetCookies(res, result.headers);
    return result.body;
  }

  @Post("login")
  @HttpCode(200)
  @Throttle(UNAUTHENTICATED_AUTH_THROTTLE)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    const result = await this.authService.login(body, req);
    applySetCookies(res, result.headers);
    return result.body;
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<unknown> {
    const result = await this.authService.logout(req);
    applySetCookies(res, result.headers);
    return result.body;
  }

  @Post("refresh")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async refresh(@Req() req: Request): Promise<unknown> {
    return this.authService.refresh(req);
  }

  /**
   * The frontend has no other way to learn "who is currently logged in"
   * (the session cookie is httpOnly) — needed for anything client-side
   * that depends on the caller's identity, e.g. deriving their role within
   * an org from the members list for role-based UI gating
   * (docs/PERMISSION_MODEL.md; the API/contract layers remain the real
   * enforcement boundary regardless of what this returns).
   */
  @Get("session")
  @UseGuards(AuthGuard)
  getSession(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Post("wallet/challenge")
  @HttpCode(200)
  @Throttle(UNAUTHENTICATED_AUTH_THROTTLE)
  async walletChallenge(
    @Body(new ZodValidationPipe(walletChallengeSchema)) body: WalletChallengeInput,
  ): Promise<unknown> {
    return this.authService.walletChallenge(body);
  }

  @Post("wallet/verify")
  @HttpCode(200)
  @Throttle(UNAUTHENTICATED_AUTH_THROTTLE)
  async walletVerify(
    @Body(new ZodValidationPipe(walletVerifySchema)) body: WalletVerifyInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    const result = await this.authService.walletVerify(body);
    applySetCookies(res, result.headers);
    return result.body;
  }

  @Post("wallet/link")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async walletLink(
    @Body(new ZodValidationPipe(walletVerifySchema)) body: WalletVerifyInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.authService.walletLink(body, req);
  }
}
