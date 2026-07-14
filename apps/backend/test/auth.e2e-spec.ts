import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash, Keypair } from "@stellar/stellar-sdk";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { firstCookie } from "./helpers/http";

// SEP-53: a wallet's `signMessage` signs `sha256("Stellar Signed
// Message:\n" + message)`, not the raw message bytes — must match
// packages/sdk/src/stellar/wallet-signature.ts's `sep53Digest` exactly or
// this test suite passes while every real wallet signature fails
// verification (see docs/DEVELOPMENT_PLAN.md's technical debt log).
function sep53Sign(message: string, keypair: Keypair): string {
  const digest = hash(Buffer.concat([Buffer.from("Stellar Signed Message:\n", "utf8"), Buffer.from(message, "utf8")]));
  return keypair.sign(digest).toString("base64");
}

// docs/TESTING_STRATEGY.md "Backend integration": full controller-to-DB
// round trip against a real Postgres (see test/setup-env.ts) — the wallet
// tests additionally hit real Stellar Testnet Horizon/Friendbot, matching
// the documented "real Testnet with a dedicated throwaway test org" pattern.
describe("AuthController (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(app.get(Logger));
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("email/password", () => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = "Xk9#mQ2vLp7$Rz4t";

    it("rejects a weak password (zxcvbn score < 3)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email, password: "password12345" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("VALIDATION_ERROR");
    });

    it("registers with a strong password and sets a session cookie", async () => {
      const res = await request(app.getHttpServer()).post("/api/v1/auth/register").send({ email, password });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(email);
      expect(firstCookie(res)).toMatch(/^better-auth\.session_token=/);
    });

    it("rejects re-registering the same email", async () => {
      const res = await request(app.getHttpServer()).post("/api/v1/auth/register").send({ email, password });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("EMAIL_ALREADY_REGISTERED");
    });

    it("GET /auth/session returns the caller's own identity, and rejects with no session", async () => {
      const registerRes = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: `e2e-session-${Date.now()}@example.com`, password });
      const cookie = firstCookie(registerRes);

      const sessionRes = await request(app.getHttpServer()).get("/api/v1/auth/session").set("Cookie", cookie);
      expect(sessionRes.status).toBe(200);
      expect(sessionRes.body.id).toBe(registerRes.body.user.id);
      expect(sessionRes.body.email).toBe(registerRes.body.user.email);

      const noSessionRes = await request(app.getHttpServer()).get("/api/v1/auth/session");
      expect(noSessionRes.status).toBe(401);
    });

    it("rejects login with the wrong password", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password: "wrong-password-entirely" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("UNAUTHENTICATED");
    });

    it("logs in with the correct password and supports refresh/logout", async () => {
      const loginRes = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password });
      expect(loginRes.status).toBe(200);
      const cookie = firstCookie(loginRes);

      const refreshRes = await request(app.getHttpServer()).post("/api/v1/auth/refresh").set("Cookie", cookie);
      expect(refreshRes.status).toBe(200);
      expect(typeof refreshRes.body.token).toBe("string");

      const logoutRes = await request(app.getHttpServer()).post("/api/v1/auth/logout").set("Cookie", cookie);
      expect(logoutRes.status).toBe(200);

      const refreshAfterLogout = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", cookie);
      expect(refreshAfterLogout.status).toBe(401);
    });

    // Regression test: minted bearer JWTs briefly had an empty-string
    // `aud`/`iss` claim (baseURL was never configured), which Better
    // Auth's own verifyJWT unconditionally rejects — see
    // better-auth.provider.ts's jwt() plugin comment. This must actually
    // exercise a real minted JWT end-to-end, not a mock, or that class of
    // bug slips back in silently.
    it("authenticates a guarded route via Authorization: Bearer <jwt> minted by /auth/refresh", async () => {
      const bearerEmail = `e2e-bearer-${Date.now()}@example.com`;
      const registerRes = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: bearerEmail, password });
      const cookie = firstCookie(registerRes);

      const refreshRes = await request(app.getHttpServer()).post("/api/v1/auth/refresh").set("Cookie", cookie);
      const jwt = refreshRes.body.token as string;
      expect(typeof jwt).toBe("string");

      const bearerLogoutRes = await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${jwt}`);
      expect(bearerLogoutRes.status).toBe(200);
    });

    it("rejects /auth/refresh and /auth/logout with no session at all", async () => {
      const refreshRes = await request(app.getHttpServer()).post("/api/v1/auth/refresh");
      expect(refreshRes.status).toBe(401);

      const logoutRes = await request(app.getHttpServer()).post("/api/v1/auth/logout");
      expect(logoutRes.status).toBe(401);
    });
  });

  describe("wallet challenge/response", () => {
    const keypair = Keypair.random();

    beforeAll(async () => {
      const resp = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(keypair.publicKey())}`);
      if (!resp.ok) throw new Error(`Friendbot funding failed: ${resp.status} ${await resp.text()}`);
    }, 30_000);

    async function signChallenge(): Promise<{ address: string; signedNonce: string }> {
      const challengeRes = await request(app.getHttpServer())
        .post("/api/v1/auth/wallet/challenge")
        .send({ address: keypair.publicKey() });
      expect(challengeRes.status).toBe(200);

      const message = `WorkforceOS auth challenge: ${challengeRes.body.nonce}`;
      const signedNonce = sep53Sign(message, keypair);
      return { address: keypair.publicKey(), signedNonce };
    }

    it("verifies a genuine signature, creates a wallet-only User, and rejects replaying the same nonce", async () => {
      const { address, signedNonce } = await signChallenge();

      const verifyRes = await request(app.getHttpServer()).post("/api/v1/auth/wallet/verify").send({ address, signedNonce });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.user.primaryWallet).toBe(address);
      expect(firstCookie(verifyRes)).toMatch(/^better-auth\.session_token=/);

      const replayRes = await request(app.getHttpServer()).post("/api/v1/auth/wallet/verify").send({ address, signedNonce });
      expect(replayRes.status).toBe(410);
      expect(replayRes.body.error).toBe("CHALLENGE_EXPIRED");
    }, 30_000);

    it("rejects an invalid signature", async () => {
      const challengeRes = await request(app.getHttpServer())
        .post("/api/v1/auth/wallet/challenge")
        .send({ address: keypair.publicKey() });

      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/wallet/verify")
        .send({ address: keypair.publicKey(), signedNonce: Buffer.from("not-a-signature").toString("base64") });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("INVALID_SIGNATURE");
      void challengeRes;
    }, 30_000);

    it("rejects /auth/wallet/link without a session", async () => {
      const { address, signedNonce } = await signChallenge();

      const res = await request(app.getHttpServer()).post("/api/v1/auth/wallet/link").send({ address, signedNonce });

      expect(res.status).toBe(401);
    }, 30_000);

    it("links a wallet to the current session's User", async () => {
      const email = `e2e-link-${Date.now()}@example.com`;
      const password = "Xk9#mQ2vLp7$Rz4t";
      const registerRes = await request(app.getHttpServer()).post("/api/v1/auth/register").send({ email, password });
      const cookie = firstCookie(registerRes);

      const linkKeypair = Keypair.random();
      const fundResp = await fetch(
        `https://friendbot.stellar.org?addr=${encodeURIComponent(linkKeypair.publicKey())}`,
      );
      if (!fundResp.ok) throw new Error(`Friendbot funding failed: ${fundResp.status}`);

      const challengeRes = await request(app.getHttpServer())
        .post("/api/v1/auth/wallet/challenge")
        .send({ address: linkKeypair.publicKey() });
      const message = `WorkforceOS auth challenge: ${challengeRes.body.nonce}`;
      const signedNonce = sep53Sign(message, linkKeypair);

      const linkRes = await request(app.getHttpServer())
        .post("/api/v1/auth/wallet/link")
        .set("Cookie", cookie)
        .send({ address: linkKeypair.publicKey(), signedNonce });

      expect(linkRes.status).toBe(200);
      expect(linkRes.body.wallet.address).toBe(linkKeypair.publicKey());
    }, 30_000);
  });
});
