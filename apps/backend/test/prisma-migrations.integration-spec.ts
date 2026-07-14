import { execFileSync } from "node:child_process";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// docs/TESTING_STRATEGY.md "Backend integration": a fresh throwaway
// database on the locally-configured Postgres server, proving migrations
// apply cleanly against a genuinely empty database — not just "works on my
// already-migrated local Postgres". No Docker/Testcontainers (see
// docs/DEVELOPMENT_PLAN.md's technical debt log for why).
describe("Prisma migrations", () => {
  const baseUrl = new URL(process.env.DATABASE_URL ?? "");
  const dbName = `migrations_test_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  let prisma: PrismaClient;

  function adminClient(): Client {
    const url = new URL(baseUrl.toString());
    url.pathname = "/postgres";
    return new Client({ connectionString: url.toString() });
  }

  beforeAll(async () => {
    const admin = adminClient();
    await admin.connect();
    await admin.query(`CREATE DATABASE "${dbName}"`);
    await admin.end();

    const testDbUrl = new URL(baseUrl.toString());
    testDbUrl.pathname = `/${dbName}`;

    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, DATABASE_URL: testDbUrl.toString() },
      stdio: "inherit",
    });

    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDbUrl.toString() }) });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    const admin = adminClient();
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await admin.end();
  });

  it("creates every model's table", async () => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `;
    const tableNames = tables.map((t) => t.table_name).sort();
    expect(tableNames).toEqual(
      [
        "_prisma_migrations",
        "accounts",
        "audit_logs",
        "contractors",
        "departments",
        "employees",
        "indexer_cursors",
        "intents",
        "jwks",
        "milestones",
        "organization_members",
        "organizations",
        "payroll_items",
        "payroll_runs",
        "sessions",
        "transactions",
        "users",
        "verifications",
        "wallets",
      ].sort(),
    );
  });

  it("round-trips an Organization through the generated client", async () => {
    const organization = await prisma.organization.create({
      data: {
        name: "Test Org",
        slug: "test-org",
        onChainOrgId: 1n,
        organizationContractAddr: "C" + "A".repeat(55),
        treasuryContractAddr: "C" + "B".repeat(55),
      },
    });

    const fetched = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
    expect(fetched.slug).toBe("test-org");
    expect(fetched.onChainOrgId).toBe(1n);
  });

  it("enforces the Employee (organizationId, onChainEmployeeId) unique constraint from docs/DATABASE_SCHEMA.md", async () => {
    const org = await prisma.organization.create({
      data: {
        name: "Unique Test Org",
        slug: "unique-test-org",
        onChainOrgId: 2n,
        organizationContractAddr: "C" + "C".repeat(55),
        treasuryContractAddr: "C" + "D".repeat(55),
      },
    });

    await prisma.employee.create({
      data: {
        organizationId: org.id,
        onChainEmployeeId: 1n,
        fullName: "Jane Doe",
        email: "jane@example.com",
        walletAddress: "G" + "A".repeat(55),
        salaryAmount: "5000",
        payFrequency: "MONTHLY",
      },
    });

    await expect(
      prisma.employee.create({
        data: {
          organizationId: org.id,
          onChainEmployeeId: 1n,
          fullName: "Duplicate",
          email: "dup@example.com",
          walletAddress: "G" + "B".repeat(55),
          salaryAmount: "1000",
          payFrequency: "WEEKLY",
        },
      }),
    ).rejects.toThrow();
  });

  it("cascades Organization deletion to its Employees (onDelete: Cascade)", async () => {
    const org = await prisma.organization.create({
      data: {
        name: "Cascade Test Org",
        slug: "cascade-test-org",
        onChainOrgId: 3n,
        organizationContractAddr: "C" + "E".repeat(55),
        treasuryContractAddr: "C" + "F".repeat(55),
      },
    });
    const employee = await prisma.employee.create({
      data: {
        organizationId: org.id,
        onChainEmployeeId: 1n,
        fullName: "Cascade Employee",
        email: "cascade@example.com",
        walletAddress: "G" + "C".repeat(55),
        salaryAmount: "2000",
        payFrequency: "MONTHLY",
      },
    });

    await prisma.organization.delete({ where: { id: org.id } });

    const found = await prisma.employee.findUnique({ where: { id: employee.id } });
    expect(found).toBeNull();
  });

  it("cascades User deletion to its Sessions and Accounts (Better Auth, onDelete: Cascade)", async () => {
    const user = await prisma.user.create({ data: { email: "cascade-user@example.com" } });
    const session = await prisma.session.create({
      data: { userId: user.id, token: "tok_cascade_test", expiresAt: new Date(Date.now() + 60_000) },
    });
    const account = await prisma.account.create({
      data: { userId: user.id, accountId: user.id, providerId: "credential", password: "hash" },
    });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.session.findUnique({ where: { id: session.id } })).toBeNull();
    expect(await prisma.account.findUnique({ where: { id: account.id } })).toBeNull();
  });
});
