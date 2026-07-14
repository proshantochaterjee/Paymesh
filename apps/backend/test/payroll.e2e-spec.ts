import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Keypair, TransactionBuilder, hash } from "@stellar/stellar-sdk";
import { PAYROLL_CHUNK_SIZE } from "@workforceos/shared";
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
// treasury/employees.e2e-spec.ts. Registers a real batch of employees
// (PAYROLL_CHUNK_SIZE + 1, so a real run spans two chunks) through the
// real Employees API, funds treasury through the real Treasury API, then
// drives a full payroll run against real Testnet.
describe("PayrollController (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const networkConfig = stellarNetworkConfig();

  let orgId: string;
  let financeCookie: string;
  let viewerCookie: string;
  let ownerKp: Keypair;
  let employeeIds: string[];

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

    const financeEmail = `payroll-finance-${Date.now()}@example.com`;
    const viewerEmail = `payroll-viewer-${Date.now()}@example.com`;
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
        name: "E2E Payroll Org",
        slug: `e2e-payroll-${Date.now()}`,
        onChainOrgId: created.orgId,
        organizationContractAddr: created.organizationAddr,
        treasuryContractAddr: created.treasuryAddr,
      },
    });
    orgId = org.id;
    // Owner satisfies FINANCE (and HR) per the role hierarchy.
    await prisma.organizationMember.create({
      data: { organizationId: orgId, userId: financeRegister.body.user.id, role: "OWNER" },
    });
    await prisma.organizationMember.create({
      data: { organizationId: orgId, userId: viewerRegister.body.user.id, role: "VIEWER" },
    });

    // Fund treasury generously via the real Treasury API.
    const depositorKp = Keypair.random();
    await fundWithFriendbot(depositorKp.publicKey());
    await establishTusdcTrustline(depositorKp);
    await payTusdc(depositorKp.publicKey(), "1000");
    const depositBuild = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/treasury/deposit-intent`)
      .set("Cookie", financeCookie)
      .send({ fromAddress: depositorKp.publicKey(), amount: "900" });
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/treasury/deposit-intent/${depositBuild.body.intentId}/submit`)
      .set("Cookie", financeCookie)
      .send({ signedXdr: signXdr(depositBuild.body.unsignedXdr, depositorKp) });

    // Register PAYROLL_CHUNK_SIZE + 1 employees for real, each with a
    // funded + trustlined wallet so their payroll transfer can succeed.
    const count = PAYROLL_CHUNK_SIZE + 1;
    employeeIds = [];
    for (let i = 0; i < count; i++) {
      const empKp = Keypair.random();
      await fundWithFriendbot(empKp.publicKey());
      await establishTusdcTrustline(empKp);

      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/employees`)
        .set("Cookie", financeCookie)
        .send({
          fullName: `E2E Payroll Employee ${i}`,
          email: `payroll-emp-${Date.now()}-${i}@example.com`,
          walletAddress: empKp.publicKey(),
          salaryAmount: "10",
          payFrequency: "MONTHLY",
        });
      const signedXdr = signXdr(createRes.body.unsignedXdr, ownerKp);
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/employees/${createRes.body.employee.id}/register-intent/${createRes.body.intentId}/submit`)
        .set("Cookie", financeCookie)
        .send({ signedXdr });
      employeeIds.push(createRes.body.employee.id);
    }
  }, 180_000);

  afterAll(async () => {
    await app.close();
  });

  it("rejects a VIEWER creating a payroll run (needs FINANCE)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/payroll-runs`)
      .set("Cookie", viewerCookie)
      .send({ payPeriodStart: "2026-01-01", payPeriodEnd: "2026-01-31", employeeIds });
    expect(res.status).toBe(403);
  });

  let runId: string;

  it("creates a DRAFT run with a snapshot total across all selected employees", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/payroll-runs`)
      .set("Cookie", financeCookie)
      .send({ payPeriodStart: "2026-01-01", payPeriodEnd: "2026-01-31", employeeIds });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.totalAmount).toBe(String(10 * employeeIds.length));
    expect(res.body.items).toHaveLength(employeeIds.length);
    runId = res.body.id;
  });

  it("rejects execute-intent before the run is scheduled", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/payroll-runs/${runId}/execute-intent`)
      .set("Cookie", financeCookie);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("INVALID_STATE_TRANSITION");
  });

  it("schedules the run: DRAFT -> SCHEDULED", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/payroll-runs/${runId}/schedule`)
      .set("Cookie", financeCookie);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("SCHEDULED");
  });

  it(
    "executes both chunks sequentially and completes the run",
    async () => {
      // Chunk 1: full PAYROLL_CHUNK_SIZE
      const chunk1Build = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/payroll-runs/${runId}/execute-intent`)
        .set("Cookie", financeCookie);
      expect(chunk1Build.status).toBe(201);
      expect(chunk1Build.body.chunkIndex).toBe(0);
      expect(chunk1Build.body.totalChunks).toBe(2);
      expect(chunk1Build.body.employeeIds).toHaveLength(PAYROLL_CHUNK_SIZE);

      const chunk1Submit = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/payroll-runs/${runId}/execute-intent/${chunk1Build.body.intentId}/submit`)
        .set("Cookie", financeCookie)
        .send({ signedXdr: signXdr(chunk1Build.body.unsignedXdr, ownerKp) });
      expect(chunk1Submit.status).toBe(202);
      expect(chunk1Submit.body.isLastChunk).toBe(false);

      const afterChunk1 = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId}/payroll-runs/${runId}`)
        .set("Cookie", financeCookie);
      expect(afterChunk1.body.status).toBe("EXECUTING");
      const paidAfterChunk1 = afterChunk1.body.items.filter((i: { status: string }) => i.status === "PAID");
      expect(paidAfterChunk1).toHaveLength(PAYROLL_CHUNK_SIZE);

      // Chunk 2: the remaining 1 employee
      const chunk2Build = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/payroll-runs/${runId}/execute-intent`)
        .set("Cookie", financeCookie);
      expect(chunk2Build.status).toBe(201);
      expect(chunk2Build.body.chunkIndex).toBe(1);
      expect(chunk2Build.body.employeeIds).toHaveLength(1);

      const chunk2Submit = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/payroll-runs/${runId}/execute-intent/${chunk2Build.body.intentId}/submit`)
        .set("Cookie", financeCookie)
        .send({ signedXdr: signXdr(chunk2Build.body.unsignedXdr, ownerKp) });
      expect(chunk2Submit.status).toBe(202);
      expect(chunk2Submit.body.isLastChunk).toBe(true);

      const finalRun = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId}/payroll-runs/${runId}`)
        .set("Cookie", financeCookie);
      expect(finalRun.body.status).toBe("COMPLETED");
      expect(finalRun.body.items.every((i: { status: string }) => i.status === "PAID")).toBe(true);
      expect(finalRun.body.items.every((i: { stellarTxHash: string | null }) => i.stellarTxHash)).toBe(true);
    },
    120_000,
  );

  it("rejects execute-intent once the run has no remaining items", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/payroll-runs/${runId}/execute-intent`)
      .set("Cookie", financeCookie);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("INVALID_STATE_TRANSITION");
  });

  it("returns 422 INSUFFICIENT_TREASURY_BALANCE with a shortfall when the run costs more than the treasury holds", async () => {
    const bigCreate = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/payroll-runs`)
      .set("Cookie", financeCookie)
      .send({ payPeriodStart: "2026-02-01", payPeriodEnd: "2026-02-28", employeeIds: employeeIds.slice(0, 1) });
    const bigRunId = bigCreate.body.id;

    // Directly inflate this run's only item to exceed the remaining treasury balance.
    await prisma.payrollItem.updateMany({ where: { payrollRunId: bigRunId }, data: { amount: "100000000" } });

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/payroll-runs/${bigRunId}/schedule`)
      .set("Cookie", financeCookie);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/payroll-runs/${bigRunId}/execute-intent`)
      .set("Cookie", financeCookie);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("INSUFFICIENT_TREASURY_BALANCE");
    expect(typeof res.body.details.shortfall).toBe("string");
  });
});
