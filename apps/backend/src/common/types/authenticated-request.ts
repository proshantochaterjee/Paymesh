import type { Request } from "express";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  primaryWallet: string | null;
}

export interface AuthenticatedSession {
  token: string;
  expiresAt: Date;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  session: AuthenticatedSession;
}
