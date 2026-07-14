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
import { createTestOrganization, fundWithFriendbot, requireDeployerKeypair } from "./helpers/testnet-fixtures";

// docs/TESTING_STRATEGY.md "Backend integration": full controller-to-DB
// round trip against real Postgres + real Stellar Testnet, mirroring
// treasury.e2e-spec.ts's pattern — a fresh organization is created on the
// real deployed payroll_factory, and the acting HR user links the org
// owner's own wallet (register_employee's `caller` must match whoever
// actually signs, so unlike treasury's explicit body address, this test
// needs a real authenticated session with a real linked wallet).
describe("EmployeesController (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const networkConfig = stellarNetworkConfig();

  let orgId: string;
  let hrCookie: string;
  let viewerCookie: string;
  let ownerKp: Keypair;

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

    const hrEmail = `employees-hr-${Date.now()}@example.com`;
    const viewerEmail = `employees-viewer-${Date.now()}@example.com`;
    const password = "Xk9#mQ2vLp7$Rz4t";

    const hrRegister = await request(app.getHttpServer()).post("/api/v1/auth/register").send({ email: hrEmail, password });
    const viewerRegister = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: viewerEmail, password });
    hrCookie = firstCookie(hrRegister);
    viewerCookie = firstCookie(viewerRegister);

    // Link the org owner's own keypair as the HR user's wallet — the
    // register/update/deactivate `caller` sent on-chain is always the
    // acting user's own primaryWallet (see employees.controller.ts's
    // requireCallerAddress), and it must match whoever signs.
    const challengeRes = await request(app.getHttpServer())
      .post("/api/v1/auth/wallet/challenge")
      .send({ address: ownerKp.publicKey() });
    const message = `WorkforceOS auth challenge: ${challengeRes.body.nonce}`;
    const digest = hash(Buffer.concat([Buffer.from("Stellar Signed Message:\n", "utf8"), Buffer.from(message, "utf8")]));
    const signedNonce = ownerKp.sign(digest).toString("base64");
    await request(app.getHttpServer())
      .post("/api/v1/auth/wallet/link")
      .set("Cookie", hrCookie)
      .send({ address: ownerKp.publicKey(), signedNonce });

    const org = await prisma.organization.create({
      data: {
        name: "E2E Employees Org",
        slug: `e2e-employees-${Date.now()}`,
        onChainOrgId: created.orgId,
        organizationContractAddr: created.organizationAddr,
        treasuryContractAddr: created.treasuryAddr,
      },
    });
    orgId = org.id;

    await prisma.organizationMember.create({
      data: { organizationId: orgId, userId: hrRegister.body.user.id, role: "OWNER" },
    });
    await prisma.organizationMember.create({
      data: { organizationId: orgId, userId: viewerRegister.body.user.id, role: "VIEWER" },
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  function signXdr(unsignedXdr: string, kp: Keypair): string {
    const tx = TransactionBuilder.fromXDR(unsignedXdr, networkConfig.networkPassphrase);
    tx.sign(kp);
    return tx.toXDR();
  }

  it("GET list returns an empty array for a fresh org", async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/organizations/${orgId}/employees`).set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("rejects a VIEWER creating an employee (needs HR)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/employees`)
      .set("Cookie", viewerCookie)
      .send({
        fullName: "Should Not Work",
        email: `nope-${Date.now()}@example.com`,
        walletAddress: Keypair.random().publicKey(),
        salaryAmount: "1000",
        payFrequency: "MONTHLY",
      });
    expect(res.status).toBe(403);
  });

  let employeeId: string;
  let employeeWallet: Keypair;

  it(
    "creates an employee (Postgres row + register-intent in one response), then submits it — onChainEmployeeId backfills",
    async () => {
      employeeWallet = Keypair.random();
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/employees`)
        .set("Cookie", hrCookie)
        .send({
          fullName: "Ada Lovelace",
          email: `ada-${Date.now()}@example.com`,
          walletAddress: employeeWallet.publicKey(),
          salaryAmount: "5000",
          payFrequency: "MONTHLY",
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.employee.onChainEmployeeId).toBeNull();
      expect(typeof createRes.body.intentId).toBe("string");
      employeeId = createRes.body.employee.id;

      const signedXdr = signXdr(createRes.body.unsignedXdr, ownerKp);
      const submitRes = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/employees/${employeeId}/register-intent/${createRes.body.intentId}/submit`)
        .set("Cookie", hrCookie)
        .send({ signedXdr });

      expect(submitRes.status).toBe(202);
      expect(submitRes.body.status).toBe("submitted");

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId}/employees/${employeeId}`)
        .set("Cookie", hrCookie);
      expect(getRes.body.onChainEmployeeId).not.toBeNull();

      const replayRes = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/employees/${employeeId}/register-intent/${createRes.body.intentId}/submit`)
        .set("Cookie", hrCookie)
        .send({ signedXdr });
      expect(replayRes.status).toBe(409);
      expect(replayRes.body.error).toBe("INTENT_ALREADY_SUBMITTED");
    },
    45_000,
  );

  it("PATCH department-only does not build an on-chain intent", async () => {
    const deptRes = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgId}/employees`)
      .set("Cookie", hrCookie);
    void deptRes;

    const dept = await prisma.department.create({ data: { organizationId: orgId, name: "Engineering" } });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${orgId}/employees/${employeeId}`)
      .set("Cookie", hrCookie)
      .send({ departmentId: dept.id });

    expect(res.status).toBe(200);
    expect(res.body.intentId).toBeUndefined();
    expect(res.body.employee.departmentId).toBe(dept.id);
  });

  it(
    "PATCH salary builds an update-intent (employee already registered on-chain) — submits successfully",
    async () => {
      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${orgId}/employees/${employeeId}`)
        .set("Cookie", hrCookie)
        .send({ salaryAmount: "6000" });

      expect(patchRes.status).toBe(200);
      expect(typeof patchRes.body.intentId).toBe("string");

      const signedXdr = signXdr(patchRes.body.unsignedXdr, ownerKp);
      const submitRes = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/employees/${employeeId}/update-intent/${patchRes.body.intentId}/submit`)
        .set("Cookie", hrCookie)
        .send({ signedXdr });

      expect(submitRes.status).toBe(202);
    },
    30_000,
  );

  it(
    "deactivates the employee (on-chain intent since it's registered) — submits successfully",
    async () => {
      const deactivateRes = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/employees/${employeeId}/deactivate`)
        .set("Cookie", hrCookie);

      expect(deactivateRes.status).toBe(201);
      expect(deactivateRes.body.employee.status).toBe("INACTIVE");
      expect(typeof deactivateRes.body.intentId).toBe("string");

      const signedXdr = signXdr(deactivateRes.body.unsignedXdr, ownerKp);
      const submitRes = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/employees/${employeeId}/deactivate-intent/${deactivateRes.body.intentId}/submit`)
        .set("Cookie", hrCookie)
        .send({ signedXdr });

      expect(submitRes.status).toBe(202);
    },
    30_000,
  );

  describe("CSV import", () => {
    it("dry-run reports valid/invalid rows without creating anything", async () => {
      const csv = [
        "full_name,email,wallet_address,department,salary_amount,pay_frequency",
        `Grace Hopper,grace-${Date.now()}@example.com,${Keypair.random().publicKey()},Engineering,7000,MONTHLY`,
        "Bad Row,not-an-email,not-a-wallet,Engineering,-5,WEEKLY",
      ].join("\n");

      const res = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/employees/import?dryRun=true`)
        .set("Cookie", hrCookie)
        .attach("file", Buffer.from(csv), "employees.csv");

      expect(res.status).toBe(201);
      expect(res.body.validRows).toBe(1);
      expect(res.body.invalidRows).toBe(1);
      expect(res.body.createdEmployees).toBeUndefined();
      const reasons = res.body.errors.map((e: { reason: string }) => e.reason);
      expect(reasons).toContain("INVALID_EMAIL");
      expect(reasons).toContain("INVALID_WALLET_ADDRESS");
      expect(reasons).toContain("INVALID_SALARY");

      const listRes = await request(app.getHttpServer()).get(`/api/v1/organizations/${orgId}/employees`).set("Cookie", hrCookie);
      expect(listRes.body).toHaveLength(1); // only Ada from the earlier test, dry-run created nothing
    });

    it(
      "a real commit creates the valid row and returns one register-intent for it",
      async () => {
        const email = `grace-${Date.now()}@example.com`;
        const csv = [
          "full_name,email,wallet_address,department,salary_amount,pay_frequency",
          `Grace Hopper,${email},${Keypair.random().publicKey()},Engineering,7000,MONTHLY`,
        ].join("\n");

        const res = await request(app.getHttpServer())
          .post(`/api/v1/organizations/${orgId}/employees/import`)
          .set("Cookie", hrCookie)
          .attach("file", Buffer.from(csv), "employees.csv");

        expect(res.status).toBe(201);
        expect(res.body.validRows).toBe(1);
        expect(res.body.createdEmployees).toHaveLength(1);

        const created = res.body.createdEmployees[0];
        const signedXdr = signXdr(created.unsignedXdr, ownerKp);
        const submitRes = await request(app.getHttpServer())
          .post(`/api/v1/organizations/${orgId}/employees/${created.employeeId}/register-intent/${created.intentId}/submit`)
          .set("Cookie", hrCookie)
          .send({ signedXdr });

        expect(submitRes.status).toBe(202);
      },
      45_000,
    );

    it("rejects a VIEWER importing a CSV (needs HR)", async () => {
      const csv = "full_name,email,wallet_address,department,salary_amount,pay_frequency\n";
      const res = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/employees/import?dryRun=true`)
        .set("Cookie", viewerCookie)
        .attach("file", Buffer.from(csv), "employees.csv");
      expect(res.status).toBe(403);
    });
  });
});
