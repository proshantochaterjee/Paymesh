import { getSessionFromCtx } from "better-auth/api";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import type { PrismaClient } from "@prisma/client";
import { setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { verifyStellarSignature } from "@workforceos/sdk";
import { walletChallengeSchema, walletVerifySchema } from "@workforceos/shared";

const WALLET_CHALLENGE_TTL_SECONDS = 5 * 60;

/**
 * Custom Better Auth plugin implementing the Stellar wallet
 * challenge/response flow (docs/AUTHENTICATION.md §2-3) — the reason
 * TECHNICAL_ARCHITECTURE.md §7 chose Better Auth over Auth.js in the first
 * place. Reuses Better Auth's built-in `Verification` store (atomic
 * single-use consume, see docs/SECURITY_MODEL.md §5) for the nonce instead
 * of a bespoke table.
 */
export function walletPlugin(options: { prisma: PrismaClient; horizonUrl: string }) {
  const { prisma, horizonUrl } = options;

  return {
    id: "wallet",
    endpoints: {
      walletChallenge: createAuthEndpoint(
        "/wallet/challenge",
        { method: "POST", body: walletChallengeSchema },
        async (ctx) => {
          const { address } = ctx.body;
          const nonce = generateRandomString(32, "a-z", "A-Z", "0-9");
          const expiresAt = new Date(Date.now() + WALLET_CHALLENGE_TTL_SECONDS * 1000);

          await ctx.context.internalAdapter.createVerificationValue({
            identifier: address,
            value: nonce,
            expiresAt,
          });

          return ctx.json({ nonce, expiresAt });
        },
      ),

      walletVerify: createAuthEndpoint(
        "/wallet/verify",
        { method: "POST", body: walletVerifySchema },
        async (ctx) => {
          const { address, signedNonce } = ctx.body;

          const record = await ctx.context.internalAdapter.consumeVerificationValue(address);
          if (!record) {
            throw APIError.from("GONE", { code: "CHALLENGE_EXPIRED", message: "Challenge expired or already used." });
          }
          const verified = await verifyStellarSignature({
            horizonUrl,
            address,
            nonce: record.value,
            signatureBase64: signedNonce,
          });
          if (!verified) {
            throw APIError.from("UNAUTHORIZED", { code: "INVALID_SIGNATURE", message: "Invalid wallet signature." });
          }

          let user = await prisma.user.findUnique({ where: { primaryWallet: address } });
          if (!user) {
            user = await prisma.user.create({ data: { primaryWallet: address } });
          }

          const session = await ctx.context.internalAdapter.createSession(user.id);
          // Better Auth's core User type requires `email`/`name`; ours are
          // nullable for wallet-only users (docs/DEVELOPMENT_PLAN.md Step 7
          // spec-gap note) — harmless at runtime, setSessionCookie only
          // reads id/token-relevant fields.
          await setSessionCookie(ctx, { session, user: user as unknown as Parameters<typeof setSessionCookie>[1]["user"] });

          return ctx.json({ user, session });
        },
      ),

      walletLink: createAuthEndpoint(
        "/wallet/link",
        { method: "POST", body: walletVerifySchema, requireHeaders: true },
        async (ctx) => {
          const session = await getSessionFromCtx(ctx);
          if (!session) {
            throw APIError.from("UNAUTHORIZED", {
              code: "UNAUTHENTICATED",
              message: "Sign in required to link a wallet.",
            });
          }

          const { address, signedNonce } = ctx.body;

          const record = await ctx.context.internalAdapter.consumeVerificationValue(address);
          if (!record) {
            throw APIError.from("GONE", { code: "CHALLENGE_EXPIRED", message: "Challenge expired or already used." });
          }
          const verified = await verifyStellarSignature({
            horizonUrl,
            address,
            nonce: record.value,
            signatureBase64: signedNonce,
          });
          if (!verified) {
            throw APIError.from("UNAUTHORIZED", { code: "INVALID_SIGNATURE", message: "Invalid wallet signature." });
          }

          const existing = await prisma.wallet.findUnique({ where: { address } });
          if (existing && existing.userId !== session.user.id) {
            throw APIError.from("CONFLICT", {
              code: "WALLET_ALREADY_LINKED",
              message: "This wallet is already linked to another account.",
            });
          }

          const wallet = existing
            ? existing
            : await prisma.wallet.create({ data: { userId: session.user.id, address } });

          // First wallet a user ever links becomes their primary
          // automatically — without this, an email/password user who
          // links a wallet has `primaryWallet: null` forever, which
          // breaks anything (e.g. on-chain action endpoints) that reads
          // the session's `primaryWallet` to know which address to act as.
          const currentPrimaryWallet = (session.user as { primaryWallet?: string | null }).primaryWallet;
          if (!currentPrimaryWallet) {
            await prisma.user.update({ where: { id: session.user.id }, data: { primaryWallet: address } });
          }

          return ctx.json({ wallet });
        },
      ),
    },
  };
}
