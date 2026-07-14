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
import {
  createTestOrganization,
  establishTusdcTrustline,
  fundWithFriendbot,
  payTusdc,
  requireDeployerKeypair,
} from "./helpers/testnet-fixtures";

// docs/TESTING_STRATEGY.md "Backend integration": full controller-to-DB
// round trip against real Postgres + real Stellar Testnet, mirroring
// treasury/employees/payroll.e2e-spec.ts. Also exercises Contractors
// (moved up to Step 12 from its original Step 14 slot, since
// Milestone.contractorId is a required FK).
describe("MilestonesController (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const networkConfig = stellarNetworkConfig();

  let orgId: string;
  let financeCookie: string;
  let viewerCookie: string;
  let ownerKp: Keypair;
  let contractorId: string;

  function signXdr(unsignedXdr: string, kp: Keypair): string {
    const tx = TransactionBuilder.fromXDR(unsignedXdr, networkConfig.networkPassphrase);
    tx.sign(kp);
    return tx.toXDR();
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(app.get(Logger));
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    prisma = moduleRef.get(PrismaService);

    requireDeployerKeypair();

    ownerKp = Keypair.random();
    await fundWithFriendbot(ownerKp.publicKey());
    const created = await createTestOrganization(ownerKp);

    const financeEmail = `milestone-finance-${Date.now()}@example.com`;
    const viewerEmail = `milestone-viewer-${Date.now()}@example.com`;
    const password = "Xk9#mQ2vLp7$Rz4t";

    const financeRegister = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: financeEmail, password });
    const viewerRegister = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: viewerEmail, password });
    financeCookie = firstCookie(financeRegister);
    viewerCookie = firstCookie(viewerRegister);

    const challengeRes = await request(app.getHttpServer())
      .post("/api/v1/auth/wallet/challenge")
      .send({ address: ownerKp.publicKey() });
    const message = `WorkforceOS auth challenge: ${challengeRes.body.nonce}`;
    const digest = hash(Buffer.concat([Buffer.from("Stellar Signed Message:\n", "utf8"), Buffer.from(message, "utf8")]));
    const signedNonce = ownerKp.sign(digest).toString("base64");
    await request(app.getHttpServer())
      .post("/api/v1/auth/wallet/link")
      .set("Cookie", financeCookie)
      .send({ address: ownerKp.publicKey(), signedNonce });

    const org = await prisma.organization.create({
      data: {
        name: "E2E Milestones Org",
        slug: `e2e-milestones-${Date.now()}`,
        onChainOrgId: created.orgId,
        organizationContractAddr: created.organizationAddr,
        treasuryContractAddr: created.treasuryAddr,
      },
    });
    orgId = org.id;
    await prisma.organizationMember.create({
      data: { organizationId: orgId, userId: financeRegister.body.user.id, role: "OWNER" },
    });
    await prisma.organizationMember.create({
      data: { organizationId: orgId, userId: viewerRegister.body.user.id, role: "VIEWER" },
    });

    // Fund treasury via the real Treasury API.
    const depositorKp = Keypair.random();
    await fundWithFriendbot(depositorKp.publicKey());
    await establishTusdcTrustline(depositorKp);
    await payTusdc(depositorKp.publicKey(), "500");
    const depositBuild = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/treasury/deposit-intent`)
      .set("Cookie", financeCookie)
      .send({ fromAddress: depositorKp.publicKey(), amount: "400" });
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/treasury/deposit-intent/${depositBuild.body.intentId}/submit`)
      .set("Cookie", financeCookie)
      .send({ signedXdr: signXdr(depositBuild.body.unsignedXdr, depositorKp) });

    // Real Contractor via the real Contractors API (moved up from Step 14).
    const contractorKp = Keypair.random();
    await fundWithFriendbot(contractorKp.publicKey());
    await establishTusdcTrustline(contractorKp);
    const contractorRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/contractors`)
      .set("Cookie", financeCookie)
      .send({ fullName: "E2E Contractor", email: `contractor-${Date.now()}@example.com`, walletAddress: contractorKp.publicKey() });
    expect(contractorRes.status).toBe(201);
    contractorId = contractorRes.body.id;
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it("rejects a VIEWER creating a milestone (needs FINANCE)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/milestones`)
      .set("Cookie", viewerCookie)
      .send({ contractorId, title: "Should fail", amount: "100" });
    expect(res.status).toBe(403);
  });

  let milestoneId: string;

  it("creates a DRAFT milestone with no on-chain interaction", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/milestones`)
      .set("Cookie", financeCookie)
      .send({ contractorId, title: "Design homepage", description: "Full redesign", amount: "100" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.onChainMilestoneId).toBeNull();
    milestoneId = res.body.id;
  });

  it("rejects approve-intent before the milestone is funded", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/milestones/${milestoneId}/approve-intent`)
      .set("Cookie", financeCookie);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("INVALID_STATE_TRANSITION");
  });

  it(
    "funds the milestone across its two on-chain steps (create then fund)",
    async () => {
      const step1Build = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/milestones/${milestoneId}/fund-intent`)
        .set("Cookie", financeCookie);
      expect(step1Build.status).toBe(201);
      expect(step1Build.body.step).toBe("create");

      const step1Submit = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/milestones/${milestoneId}/fund-intent/${step1Build.body.intentId}/submit`)
        .set("Cookie", financeCookie)
        .send({ signedXdr: signXdr(step1Build.body.unsignedXdr, ownerKp) });
      expect(step1Submit.status).toBe(202);
      expect(step1Submit.body.step).toBe("create");

      const afterCreate = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId}/milestones/${milestoneId}`)
        .set("Cookie", financeCookie);
      expect(afterCreate.body.status).toBe("DRAFT");
      expect(afterCreate.body.onChainMilestoneId).not.toBeNull();

      const step2Build = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/milestones/${milestoneId}/fund-intent`)
        .set("Cookie", financeCookie);
      expect(step2Build.status).toBe(201);
      expect(step2Build.body.step).toBe("fund");

      const step2Submit = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/milestones/${milestoneId}/fund-intent/${step2Build.body.intentId}/submit`)
        .set("Cookie", financeCookie)
        .send({ signedXdr: signXdr(step2Build.body.unsignedXdr, ownerKp) });
      expect(step2Submit.status).toBe(202);
      expect(step2Submit.body.step).toBe("fund");

      const afterFund = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId}/milestones/${milestoneId}`)
        .set("Cookie", financeCookie);
      expect(afterFund.body.status).toBe("FUNDED");
    },
    90_000,
  );

  it(
    "approves then releases the milestone",
    async () => {
      const approveBuild = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/milestones/${milestoneId}/approve-intent`)
        .set("Cookie", financeCookie);
      expect(approveBuild.status).toBe(201);
      const approveSubmit = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/milestones/${milestoneId}/approve-intent/${approveBuild.body.intentId}/submit`)
        .set("Cookie", financeCookie)
        .send({ signedXdr: signXdr(approveBuild.body.unsignedXdr, ownerKp) });
      expect(approveSubmit.status).toBe(202);

      const afterApprove = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId}/milestones/${milestoneId}`)
        .set("Cookie", financeCookie);
      expect(afterApprove.body.status).toBe("APPROVED");

      const releaseBuild = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/milestones/${milestoneId}/release-intent`)
        .set("Cookie", financeCookie);
      expect(releaseBuild.status).toBe(201);
      const releaseSubmit = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/milestones/${milestoneId}/release-intent/${releaseBuild.body.intentId}/submit`)
        .set("Cookie", financeCookie)
        .send({ signedXdr: signXdr(releaseBuild.body.unsignedXdr, ownerKp) });
      expect(releaseSubmit.status).toBe(202);

      const afterRelease = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId}/milestones/${milestoneId}`)
        .set("Cookie", financeCookie);
      expect(afterRelease.body.status).toBe("RELEASED");
      expect(afterRelease.body.stellarTxHash).toBeTruthy();
    },
    90_000,
  );

  it("cancels a Draft milestone Postgres-only, with no intent needed", async () => {
    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/milestones`)
      .set("Cookie", financeCookie)
      .send({ contractorId, title: "Never funded", amount: "10" });
    const draftMilestoneId = createRes.body.id;

    const cancelRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/milestones/${draftMilestoneId}/cancel-intent`)
      .set("Cookie", financeCookie);

    expect(cancelRes.status).toBe(201);
    expect(cancelRes.body.milestone.status).toBe("CANCELLED");
    expect(cancelRes.body.intentId).toBeUndefined();
  });

  it(
    "cancels a Funded milestone on-chain (refund) via a real intent",
    async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/milestones`)
        .set("Cookie", financeCookie)
        .send({ contractorId, title: "Will be refunded", amount: "20" });
      const refundMilestoneId = createRes.body.id;

      const step1 = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/milestones/${refundMilestoneId}/fund-intent`)
        .set("Cookie", financeCookie);
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/milestones/${refundMilestoneId}/fund-intent/${step1.body.intentId}/submit`)
        .set("Cookie", financeCookie)
        .send({ signedXdr: signXdr(step1.body.unsignedXdr, ownerKp) });
      const step2 = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/milestones/${refundMilestoneId}/fund-intent`)
        .set("Cookie", financeCookie);
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/milestones/${refundMilestoneId}/fund-intent/${step2.body.intentId}/submit`)
        .set("Cookie", financeCookie)
        .send({ signedXdr: signXdr(step2.body.unsignedXdr, ownerKp) });

      const cancelBuild = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/milestones/${refundMilestoneId}/cancel-intent`)
        .set("Cookie", financeCookie);
      expect(cancelBuild.status).toBe(201);
      expect(typeof cancelBuild.body.intentId).toBe("string");

      const cancelSubmit = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/milestones/${refundMilestoneId}/cancel-intent/${cancelBuild.body.intentId}/submit`)
        .set("Cookie", financeCookie)
        .send({ signedXdr: signXdr(cancelBuild.body.unsignedXdr, ownerKp) });
      expect(cancelSubmit.status).toBe(202);

      const afterCancel = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId}/milestones/${refundMilestoneId}`)
        .set("Cookie", financeCookie);
      expect(afterCancel.body.status).toBe("CANCELLED");
    },
    120_000,
  );
});
