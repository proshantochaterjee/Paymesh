import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { stellarNetworkConfig } from "@workforceos/sdk";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { firstCookie } from "./helpers/http";
import {
  createTestOrganization,
  establishTusdcTrustline,
  fundWithFriendbot,
  payTusdc,
  requireDeployerKeypair,
} from "./helpers/testnet-fixtures";

// docs/TESTING_STRATEGY.md "Backend integration": full controller-to-DB
// round trip against a real Postgres, and (since Treasury genuinely needs
// it) real Stellar Testnet — a fresh organization is created on the real
// deployed payroll_factory per docs/DEPLOYMENT_GUIDE.md rather than
// depending on any pre-existing org, so this suite is self-contained
// beyond the local `workforceos-deployer` CLI identity (see
// test/helpers/testnet-fixtures.ts — same category of local dependency as
// the Postgres integration test needing a local Postgres server).
describe("TreasuryController (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const networkConfig = stellarNetworkConfig();

  let orgId: string;
  let ownerCookie: string;
  let viewerCookie: string;
  let ownerKp: Keypair;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(app.get(Logger));
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    prisma = moduleRef.get(PrismaService);

    requireDeployerKeypair(); // fail fast with a clear message if the local identity is missing

    ownerKp = Keypair.random();
    await fundWithFriendbot(ownerKp.publicKey());
    const created = await createTestOrganization(ownerKp);

    const ownerEmail = `treasury-owner-${Date.now()}@example.com`;
    const viewerEmail = `treasury-viewer-${Date.now()}@example.com`;
    const password = "Xk9#mQ2vLp7$Rz4t";

    const ownerRegister = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: ownerEmail, password });
    const viewerRegister = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: viewerEmail, password });
    ownerCookie = firstCookie(ownerRegister);
    viewerCookie = firstCookie(viewerRegister);

    const org = await prisma.organization.create({
      data: {
        name: "E2E Treasury Org",
        slug: `e2e-treasury-${Date.now()}`,
        onChainOrgId: created.orgId,
        organizationContractAddr: created.organizationAddr,
        treasuryContractAddr: created.treasuryAddr,
      },
    });
    orgId = org.id;

    await prisma.organizationMember.create({
      data: { organizationId: orgId, userId: ownerRegister.body.user.id, role: "OWNER" },
    });
    await prisma.organizationMember.create({
      data: { organizationId: orgId, userId: viewerRegister.body.user.id, role: "VIEWER" },
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  // The submit endpoint returns as soon as the network accepts the
  // transaction, before it's actually applied in a closed ledger
  // (docs/BACKEND_ARCHITECTURE.md §5: "returns immediately without
  // blocking on final confirmation") — the real product polls until the
  // Event Indexer confirms it; this test polls the live balance directly
  // for the same reason.
  async function waitForBalance(expected: string, cookie: string): Promise<void> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const res = await request(app.getHttpServer()).get(`/api/v1/organizations/${orgId}/treasury`).set("Cookie", cookie);
      if (res.body.balance === expected) return;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error(`Balance did not reach ${expected} in time`);
  }

  it("GET treasury overview returns the live balance and zero pending obligations for a fresh org", async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/organizations/${orgId}/treasury`).set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ balance: "0", pendingObligations: "0" });
  });

  it("rejects a VIEWER building a deposit-intent (needs FINANCE)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/treasury/deposit-intent`)
      .set("Cookie", viewerCookie)
      .send({ fromAddress: "G" + "A".repeat(55), amount: "1" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN_ROLE");
  });

  it("allows a VIEWER to read the overview", async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/organizations/${orgId}/treasury`).set("Cookie", viewerCookie);
    expect(res.status).toBe(200);
  });

  it("builds, signs, and submits a deposit — balance updates, and replaying the same intent is rejected", async () => {
    const depositorKp = Keypair.random();
    await fundWithFriendbot(depositorKp.publicKey());
    await establishTusdcTrustline(depositorKp);
    await payTusdc(depositorKp.publicKey(), "20");

    const buildRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/treasury/deposit-intent`)
      .set("Cookie", ownerCookie)
      .send({ fromAddress: depositorKp.publicKey(), amount: "15" });
    expect(buildRes.status).toBe(201);
    expect(typeof buildRes.body.intentId).toBe("string");

    const tx = TransactionBuilder.fromXDR(buildRes.body.unsignedXdr, networkConfig.networkPassphrase);
    tx.sign(depositorKp);

    const submitRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/treasury/deposit-intent/${buildRes.body.intentId}/submit`)
      .set("Cookie", ownerCookie)
      .send({ signedXdr: tx.toXDR() });
    expect(submitRes.status).toBe(202);
    expect(submitRes.body.status).toBe("submitted");
    expect(typeof submitRes.body.stellarTxHash).toBe("string");

    const replayRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/treasury/deposit-intent/${buildRes.body.intentId}/submit`)
      .set("Cookie", ownerCookie)
      .send({ signedXdr: tx.toXDR() });
    expect(replayRes.status).toBe(409);
    expect(replayRes.body.error).toBe("INTENT_ALREADY_SUBMITTED");

    await waitForBalance("15", ownerCookie);
  }, 45_000);

  it("returns 502 SIMULATION_FAILED (not a fake success) when the withdrawal destination has no TUSDC trustline", async () => {
    const destKp = Keypair.random();
    await fundWithFriendbot(destKp.publicKey());

    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/treasury/withdraw-intent`)
      .set("Cookie", ownerCookie)
      .send({ callerAddress: ownerKp.publicKey(), toAddress: destKp.publicKey(), amount: "1" });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("SIMULATION_FAILED");
  }, 30_000);

  it("builds, signs, and submits a withdrawal by the org Owner — balance decreases", async () => {
    const destKp = Keypair.random();
    await fundWithFriendbot(destKp.publicKey());
    await establishTusdcTrustline(destKp);

    const buildRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/treasury/withdraw-intent`)
      .set("Cookie", ownerCookie)
      .send({ callerAddress: ownerKp.publicKey(), toAddress: destKp.publicKey(), amount: "5" });
    expect(buildRes.status).toBe(201);

    const tx = TransactionBuilder.fromXDR(buildRes.body.unsignedXdr, networkConfig.networkPassphrase);
    tx.sign(ownerKp);

    const submitRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/treasury/withdraw-intent/${buildRes.body.intentId}/submit`)
      .set("Cookie", ownerCookie)
      .send({ signedXdr: tx.toXDR() });
    expect(submitRes.status).toBe(202);

    await waitForBalance("10", ownerCookie);
  }, 45_000);

  it("rejects a VIEWER building a withdraw-intent (needs ADMIN)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/treasury/withdraw-intent`)
      .set("Cookie", viewerCookie)
      .send({ callerAddress: ownerKp.publicKey(), toAddress: "G" + "A".repeat(55), amount: "1" });

    expect(res.status).toBe(403);
  });
});
