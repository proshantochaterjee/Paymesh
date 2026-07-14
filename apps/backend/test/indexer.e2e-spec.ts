import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { getLatestLedgerSequence, stellarNetworkConfig } from "@workforceos/sdk";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { IndexerService } from "../src/modules/indexer/indexer.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { firstCookie } from "./helpers/http";
import {
  createTestOrganization,
  establishTusdcTrustline,
  fundWithFriendbot,
  payTusdc,
  requireDeployerKeypair,
} from "./helpers/testnet-fixtures";

/**
 * docs/EVENT_INDEXING.md end-to-end: a real deposit against a real
 * deployed `treasury` contract is materialized into a `Transaction` row
 * by `IndexerService.pollAll()` — called directly here rather than
 * waiting on the real 5s BullMQ schedule (docs/DEVELOPMENT_PLAN.md's Step
 * 13 entry: this is the indexer's own logic under test, not the
 * scheduling wrapper around it).
 *
 * A brand-new contract's cursor deliberately baselines at the *current*
 * ledger with no historical backfill (see `IndexerService.pollContract`),
 * so this test seeds the treasury's `IndexerCursor` one ledger early
 * (before the deposit happens) — otherwise the first `pollAll()` call
 * would just set the baseline and the deposit would be seen as
 * "history" from the indexer's perspective, exactly as a real operator
 * registering a pre-existing organization would experience.
 */
describe("IndexerService (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let indexerService: IndexerService;
  const networkConfig = stellarNetworkConfig();

  let orgId: string;
  let treasuryContractAddr: string;
  let ownerCookie: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(app.get(Logger));
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    prisma = moduleRef.get(PrismaService);
    indexerService = moduleRef.get(IndexerService);

    requireDeployerKeypair();

    const ownerKp = Keypair.random();
    await fundWithFriendbot(ownerKp.publicKey());
    const created = await createTestOrganization(ownerKp);
    treasuryContractAddr = created.treasuryAddr;

    const ownerEmail = `indexer-owner-${Date.now()}@example.com`;
    const password = "Xk9#mQ2vLp7$Rz4t";
    const ownerRegister = await request(app.getHttpServer()).post("/api/v1/auth/register").send({ email: ownerEmail, password });
    ownerCookie = firstCookie(ownerRegister);

    const org = await prisma.organization.create({
      data: {
        name: "E2E Indexer Org",
        slug: `e2e-indexer-${Date.now()}`,
        onChainOrgId: created.orgId,
        organizationContractAddr: created.organizationAddr,
        treasuryContractAddr: created.treasuryAddr,
      },
    });
    orgId = org.id;
    await prisma.organizationMember.create({ data: { organizationId: orgId, userId: ownerRegister.body.user.id, role: "OWNER" } });

    // Seed the cursor one ledger before "now" so the upcoming deposit
    // isn't treated as pre-existing history by the fresh-contract
    // baseline logic described above.
    const currentLedger = await getLatestLedgerSequence(networkConfig);
    await prisma.indexerCursor.create({
      data: { contractAddress: treasuryContractAddr, lastLedgerSequence: BigInt(currentLedger - 1) },
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it("materializes a real deposit into a Transaction row and advances the cursor", async () => {
    const depositorKp = Keypair.random();
    await fundWithFriendbot(depositorKp.publicKey());
    await establishTusdcTrustline(depositorKp);
    await payTusdc(depositorKp.publicKey(), "20");

    const buildRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/treasury/deposit-intent`)
      .set("Cookie", ownerCookie)
      .send({ fromAddress: depositorKp.publicKey(), amount: "12" });
    expect(buildRes.status).toBe(201);

    const tx = TransactionBuilder.fromXDR(buildRes.body.unsignedXdr, networkConfig.networkPassphrase);
    tx.sign(depositorKp);

    const submitRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/treasury/deposit-intent/${buildRes.body.intentId}/submit`)
      .set("Cookie", ownerCookie)
      .send({ signedXdr: tx.toXDR() });
    expect(submitRes.status).toBe(202);
    const stellarTxHash = submitRes.body.stellarTxHash as string;

    // Real ledger close time on Testnet is a few seconds — poll pollAll()
    // rather than assuming one call lands after confirmation.
    let transaction = null;
    for (let attempt = 0; attempt < 10 && !transaction; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await indexerService.pollAll();
      transaction = await prisma.transaction.findFirst({ where: { organizationId: orgId, type: "DEPOSIT" } });
    }

    expect(transaction).not.toBeNull();
    // stroopsToDecimal strips trailing zeros (docs/API_SPECIFICATION.md's
    // Payroll example: "12500" not "12500.0000000") — same convention here.
    expect(transaction!.amount.toString()).toBe("12");
    expect(transaction!.status).toBe("CONFIRMED");
    expect(transaction!.fromAddress).toBe(depositorKp.publicKey());
    expect(transaction!.toAddress).toBe(treasuryContractAddr);
    expect(transaction!.stellarTxHash).toBe(stellarTxHash);

    const cursor = await prisma.indexerCursor.findUnique({ where: { contractAddress: treasuryContractAddr } });
    expect(cursor!.lastLedgerSequence).toBeGreaterThan(0n);

    // Idempotency: reprocessing the same ledger range must not duplicate
    // the row (docs/EVENT_INDEXING.md §4).
    await prisma.indexerCursor.update({ where: { contractAddress: treasuryContractAddr }, data: { lastLedgerSequence: cursor!.lastLedgerSequence - 5n } });
    await indexerService.pollAll();
    const count = await prisma.transaction.count({ where: { organizationId: orgId, type: "DEPOSIT" } });
    expect(count).toBe(1);
  }, 90_000);
});
