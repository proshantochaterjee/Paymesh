import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Keypair, TransactionBuilder, hash } from "@stellar/stellar-sdk";
import { stellarNetworkConfig } from "@workforceos/sdk";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { firstCookie } from "./helpers/http";
import { fundWithFriendbot } from "./helpers/testnet-fixtures";

/**
 * docs/TESTING_STRATEGY.md "Backend integration": full controller-to-DB
 * round trip against a real Postgres and real Stellar Testnet — org
 * creation and member grant/revoke all require `require_auth()` from a
 * real wallet (docs/DEVELOPMENT_PLAN.md's Organizations entry), so unlike
 * a synchronous-looking `POST /organizations` this drives the same
 * build-XDR / sign-client-side / submit-signed-XDR flow every other
 * on-chain mutation in this system uses.
 */
describe("OrganizationsController (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const networkConfig = stellarNetworkConfig();

  let ownerCookie: string;
  let ownerKp: Keypair;
  let memberCookie: string;
  let memberKp: Keypair;
  let memberUserId: string;

  async function linkWallet(cookie: string, kp: Keypair): Promise<void> {
    const challengeRes = await request(app.getHttpServer())
      .post("/api/v1/auth/wallet/challenge")
      .send({ address: kp.publicKey() });
    const message = `WorkforceOS auth challenge: ${challengeRes.body.nonce}`;
    const digest = hash(Buffer.concat([Buffer.from("Stellar Signed Message:\n", "utf8"), Buffer.from(message, "utf8")]));
    const signedNonce = kp.sign(digest).toString("base64");
    const linkRes = await request(app.getHttpServer())
      .post("/api/v1/auth/wallet/link")
      .set("Cookie", cookie)
      .send({ address: kp.publicKey(), signedNonce });
    expect(linkRes.status).toBe(200);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(app.get(Logger));
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    prisma = moduleRef.get(PrismaService);

    ownerKp = Keypair.random();
    memberKp = Keypair.random();
    await fundWithFriendbot(ownerKp.publicKey());
    await fundWithFriendbot(memberKp.publicKey());

    const password = "Xk9#mQ2vLp7$Rz4t";
    const ownerRegister = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: `org-owner-${Date.now()}@example.com`, password });
    const memberRegister = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: `org-member-${Date.now()}@example.com`, password });
    ownerCookie = firstCookie(ownerRegister);
    memberCookie = firstCookie(memberRegister);
    memberUserId = memberRegister.body.user.id;

    await linkWallet(ownerCookie, ownerKp);
    await linkWallet(memberCookie, memberKp);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  let orgId: string;
  let orgName: string;
  let memberRowId: string;

  it("rejects building a create-intent for a user with no linked wallet", async () => {
    const registerRes = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: `org-nowallet-${Date.now()}@example.com`, password: "Xk9#mQ2vLp7$Rz4t" });

    const res = await request(app.getHttpServer())
      .post("/api/v1/organizations/create-intent")
      .set("Cookie", firstCookie(registerRes))
      .send({ name: "No Wallet Org" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  it("builds, signs, and submits a create-intent — persists the Organization + creator's OWNER membership only once confirmed", async () => {
    orgName = `E2E Org ${Date.now()}`;
    const buildRes = await request(app.getHttpServer())
      .post("/api/v1/organizations/create-intent")
      .set("Cookie", ownerCookie)
      .send({ name: orgName });
    expect(buildRes.status).toBe(201);
    expect(typeof buildRes.body.intentId).toBe("string");

    const tx = TransactionBuilder.fromXDR(buildRes.body.unsignedXdr, networkConfig.networkPassphrase);
    tx.sign(ownerKp);

    const submitRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/create-intent/${buildRes.body.intentId}/submit`)
      .set("Cookie", ownerCookie)
      .send({ signedXdr: tx.toXDR() });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.name).toBe(orgName);
    expect(typeof submitRes.body.onChainOrgId).toBe("string");
    expect(submitRes.body.organizationContractAddr).toMatch(/^C/);
    expect(submitRes.body.treasuryContractAddr).toMatch(/^C/);
    orgId = submitRes.body.id;

    const membership = await prisma.organizationMember.findFirst({ where: { organizationId: orgId } });
    expect(membership?.role).toBe("OWNER");

    const replayRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/create-intent/${buildRes.body.intentId}/submit`)
      .set("Cookie", ownerCookie)
      .send({ signedXdr: tx.toXDR() });
    expect(replayRes.status).toBe(409);
    expect(replayRes.body.error).toBe("INTENT_ALREADY_SUBMITTED");
  }, 45_000);

  it("rejects creating a second org with the same name (SLUG_TAKEN)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/organizations/create-intent")
      .set("Cookie", ownerCookie)
      .send({ name: orgName });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("SLUG_TAKEN");
  });

  it("GET /organizations lists the org for its owner", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/organizations").set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
    expect(res.body.some((org: { id: string }) => org.id === orgId)).toBe(true);
  });

  it("GET /organizations/:id returns the org profile", async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/organizations/${orgId}`).set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orgId);
  });

  it("rejects a non-member reading the org profile", async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/organizations/${orgId}`).set("Cookie", memberCookie);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN_ROLE");
  });

  it("PATCH /organizations/:id updates the name (Postgres-only, no chain call)", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${orgId}`)
      .set("Cookie", ownerCookie)
      .send({ name: "Renamed E2E Org" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Renamed E2E Org");
  });

  it("rejects inviting an unregistered email (USER_NOT_FOUND)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/members/add-intent`)
      .set("Cookie", ownerCookie)
      .send({ email: `nobody-e2e-${Date.now()}@example.com`, role: "HR" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("USER_NOT_FOUND");
  });

  it("builds, signs, and submits an add-member intent — grants an on-chain role and upserts the Postgres membership", async () => {
    const memberUser = await prisma.user.findUniqueOrThrow({ where: { id: memberUserId } });

    const buildRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/members/add-intent`)
      .set("Cookie", ownerCookie)
      .send({ email: memberUser.email, role: "HR" });
    expect(buildRes.status).toBe(201);

    const tx = TransactionBuilder.fromXDR(buildRes.body.unsignedXdr, networkConfig.networkPassphrase);
    tx.sign(ownerKp);

    const submitRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/members/add-intent/${buildRes.body.intentId}/submit`)
      .set("Cookie", ownerCookie)
      .send({ signedXdr: tx.toXDR() });
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.role).toBe("HR");
    memberRowId = submitRes.body.id;
  }, 45_000);

  it("GET /organizations/:id/members lists both members", async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/organizations/${orgId}/members`).set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("rejects the new HR member building an add-member intent (needs ADMIN)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/members/add-intent`)
      .set("Cookie", memberCookie)
      .send({ email: "irrelevant@example.com", role: "VIEWER" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN_ROLE");
  });

  it("builds, signs, and submits a role-change intent for the member", async () => {
    const buildRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/members/${memberRowId}/role-intent`)
      .set("Cookie", ownerCookie)
      .send({ role: "FINANCE" });
    expect(buildRes.status).toBe(201);

    const tx = TransactionBuilder.fromXDR(buildRes.body.unsignedXdr, networkConfig.networkPassphrase);
    tx.sign(ownerKp);

    const submitRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/members/${memberRowId}/role-intent/${buildRes.body.intentId}/submit`)
      .set("Cookie", ownerCookie)
      .send({ signedXdr: tx.toXDR() });
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.role).toBe("FINANCE");
  }, 45_000);

  it("rejects removing the last remaining OWNER (INVALID_STATE_TRANSITION)", async () => {
    const ownerMembership = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId: orgId, role: "OWNER" },
    });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/members/${ownerMembership.id}/remove-intent`)
      .set("Cookie", ownerCookie);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("INVALID_STATE_TRANSITION");
  });

  it("builds, signs, and submits a remove-member intent — revokes on-chain and deletes the Postgres row", async () => {
    const buildRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/members/${memberRowId}/remove-intent`)
      .set("Cookie", ownerCookie);
    expect(buildRes.status).toBe(201);

    const tx = TransactionBuilder.fromXDR(buildRes.body.unsignedXdr, networkConfig.networkPassphrase);
    tx.sign(ownerKp);

    const submitRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/members/${memberRowId}/remove-intent/${buildRes.body.intentId}/submit`)
      .set("Cookie", ownerCookie)
      .send({ signedXdr: tx.toXDR() });
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.status).toBe("removed");

    const membersRes = await request(app.getHttpServer()).get(`/api/v1/organizations/${orgId}/members`).set("Cookie", ownerCookie);
    expect(membersRes.body).toHaveLength(1);
  }, 45_000);
});
