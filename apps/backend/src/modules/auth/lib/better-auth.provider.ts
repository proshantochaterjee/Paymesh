import { ConfigService } from "@nestjs/config";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { jwt } from "better-auth/plugins/jwt";

import type { AppConfig } from "../../../config/config.schema";
import { PrismaService } from "../../../prisma/prisma.service";
import { hashPassword, verifyPassword } from "./password-hasher";
import { walletPlugin } from "./wallet-plugin";

/**
 * Builds the Better Auth server instance (docs/AUTHENTICATION.md,
 * docs/TECHNICAL_ARCHITECTURE.md §7). Not mounted as Better Auth's own
 * HTTP router — AuthController calls `auth.api.*` programmatically so the
 * route shapes/responses stay exactly what docs/API_SPECIFICATION.md
 * documents (docs/BACKEND_ARCHITECTURE.md §1: controllers own the HTTP
 * layer).
 */
export function buildAuthInstance(prisma: PrismaService, config: ConfigService<AppConfig, true>) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    secret: config.get("AUTH_JWT_SECRET", { infer: true }),
    session: {
      expiresIn: config.get("AUTH_SESSION_TTL_SECONDS", { infer: true }),
    },
    user: {
      additionalFields: {
        // Set only by the wallet challenge/response flow (wallet-plugin.ts),
        // never via a generic profile-update endpoint.
        primaryWallet: { type: "string", required: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      // docs/AUTHENTICATION.md §5: min 12 chars (also enforced by
      // packages/shared's registerSchema at the API boundary); argon2id
      // hashing (Better Auth's own default is scrypt, overridden below).
      minPasswordLength: 12,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    plugins: [
      // docs/AUTHENTICATION.md §4: 15 min bearer access token — matches the
      // jwt plugin's own default expirationTime, kept explicit here so a
      // future library default change can't silently drift from the doc.
      // issuer/audience are set explicitly (rather than left to default to
      // `baseURL`, which this app never configures) — otherwise Better
      // Auth mints tokens with an empty-string `aud`/`iss` claim, and its
      // own `verifyJWT` unconditionally rejects any token with a falsy
      // `aud`, silently breaking every bearer-mode request.
      jwt({ jwt: { expirationTime: "15m", issuer: "workforceos", audience: "workforceos" } }),
      walletPlugin({ prisma, horizonUrl: config.get("STELLAR_HORIZON_URL", { infer: true }) }),
    ],
  });
}

export type Auth = ReturnType<typeof buildAuthInstance>;
