// docs/DATABASE_SCHEMA.md "Migration strategy": creates a demo organization
// with sample employees/contractors/payroll history for local dev and the
// SCF demo. Never run against a production-like database automatically —
// docs/DEVOPS.md §3: guarded by an explicit --allow-non-local flag
// requirement.
//
// Run via `npm run db:seed` from the repo root (docs/DOCKER_SETUP.md §5).
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config as loadEnv } from "dotenv";

// Invoked from the repo root, but DATABASE_URL lives in apps/backend/.env
// (docs/DOCKER_SETUP.md §5's `cp apps/backend/.env.example apps/backend/.env`).
loadEnv({ path: path.join(__dirname, "..", "apps", "backend", ".env") });

function assertLocalOrExplicitlyAllowed(): void {
  const allowNonLocal = process.argv.includes("--allow-non-local");
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const looksLocal = /(localhost|127\.0\.0\.1)/.test(databaseUrl);

  if (!looksLocal && !allowNonLocal) {
    console.error(
      "Refusing to seed: DATABASE_URL does not look like a local database, " +
        "and --allow-non-local was not passed. This script is for local " +
        "dev/SCF-demo data only — never run it against a shared or " +
        "production-like database without explicitly confirming that's " +
        "what you mean to do.",
    );
    process.exit(1);
  }
}

/**
 * Deterministic, syntactically-valid-looking fake Stellar address (56
 * chars, base32 charset) derived from a label — no chain interaction
 * exists yet at this step, so on-chain identifiers are fabricated for UI
 * realism, not fetched from a real deployment.
 */
function fakeAddress(prefix: "G" | "C", label: string): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  let body = "";
  for (let i = 0; i < 55; i++) {
    hash = (Math.imul(hash, 1103515245) + 12345) >>> 0;
    body += charset[hash % charset.length];
  }
  return prefix + body;
}

function requireByKey<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key);
  if (!value) {
    throw new Error(`Expected seed data for key: ${String(key)}`);
  }
  return value;
}

function fakeTxHash(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  let hex = "";
  for (let i = 0; i < 64; i++) {
    hash = (Math.imul(hash, 1103515245) + 12345) >>> 0;
    hex += (hash % 16).toString(16);
  }
  return hex;
}

async function main(): Promise<void> {
  assertLocalOrExplicitlyAllowed();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the database.");
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  try {
    const organization = await prisma.organization.upsert({
      where: { slug: "acme-dao" },
      update: {},
      create: {
        name: "Acme DAO",
        slug: "acme-dao",
        onChainOrgId: 1n,
        organizationContractAddr: fakeAddress("C", "acme-dao-organization"),
        treasuryContractAddr: fakeAddress("C", "acme-dao-treasury"),
      },
    });

    const [owner, finance, hr] = await Promise.all([
      prisma.user.upsert({
        where: { email: "owner@acme.xyz" },
        update: {},
        create: { email: "owner@acme.xyz", primaryWallet: fakeAddress("G", "acme-owner-wallet") },
      }),
      prisma.user.upsert({
        where: { email: "finance@acme.xyz" },
        update: {},
        create: { email: "finance@acme.xyz", primaryWallet: fakeAddress("G", "acme-finance-wallet") },
      }),
      prisma.user.upsert({
        where: { email: "hr@acme.xyz" },
        update: {},
        create: { email: "hr@acme.xyz", primaryWallet: fakeAddress("G", "acme-hr-wallet") },
      }),
    ]);

    const memberships: { userId: string; role: "OWNER" | "FINANCE" | "HR" }[] = [
      { userId: owner.id, role: "OWNER" },
      { userId: finance.id, role: "FINANCE" },
      { userId: hr.id, role: "HR" },
    ];
    await Promise.all(
      memberships.map(({ userId, role }) =>
        prisma.organizationMember.upsert({
          where: { organizationId_userId: { organizationId: organization.id, userId } },
          update: { role },
          create: { organizationId: organization.id, userId, role },
        }),
      ),
    );

    const [engineering, design] = await Promise.all([
      prisma.department.upsert({
        where: { organizationId_name: { organizationId: organization.id, name: "Engineering" } },
        update: {},
        create: { organizationId: organization.id, name: "Engineering" },
      }),
      prisma.department.upsert({
        where: { organizationId_name: { organizationId: organization.id, name: "Design" } },
        update: {},
        create: { organizationId: organization.id, name: "Design" },
      }),
    ]);

    const employeeSeeds = [
      {
        onChainEmployeeId: 1n,
        fullName: "Jane Doe",
        email: "jane@acme.xyz",
        departmentId: engineering.id,
        salaryAmount: "6000",
        payFrequency: "MONTHLY" as const,
        status: "ACTIVE" as const,
      },
      {
        onChainEmployeeId: 2n,
        fullName: "John Roe",
        email: "john@acme.xyz",
        departmentId: design.id,
        salaryAmount: "3000",
        payFrequency: "BI_WEEKLY" as const,
        status: "ACTIVE" as const,
      },
      {
        onChainEmployeeId: 3n,
        fullName: "Alex Kim",
        email: "alex@acme.xyz",
        departmentId: engineering.id,
        salaryAmount: "4500",
        payFrequency: "WEEKLY" as const,
        status: "INACTIVE" as const,
      },
    ];

    const employees = await Promise.all(
      employeeSeeds.map((seed) =>
        prisma.employee.upsert({
          where: {
            organizationId_onChainEmployeeId: {
              organizationId: organization.id,
              onChainEmployeeId: seed.onChainEmployeeId,
            },
          },
          update: {},
          create: {
            organizationId: organization.id,
            departmentId: seed.departmentId,
            onChainEmployeeId: seed.onChainEmployeeId,
            fullName: seed.fullName,
            email: seed.email,
            walletAddress: fakeAddress("G", `employee-${seed.email}`),
            salaryAmount: seed.salaryAmount,
            payFrequency: seed.payFrequency,
            status: seed.status,
          },
        }),
      ),
    );
    const employeeByEmail = new Map(employees.map((employee) => [employee.email, employee]));
    const janeDoe = requireByKey(employeeByEmail, "jane@acme.xyz");
    const johnRoe = requireByKey(employeeByEmail, "john@acme.xyz");

    const contractorSeeds = [
      { fullName: "Sam Builder", email: "sam@contractors.xyz" },
      { fullName: "Taylor Designer", email: "taylor@contractors.xyz" },
    ];
    const contractors = await Promise.all(
      contractorSeeds.map((seed) =>
        prisma.contractor.upsert({
          where: { id: `${organization.id}-${seed.email}` },
          update: {},
          create: {
            id: `${organization.id}-${seed.email}`,
            organizationId: organization.id,
            fullName: seed.fullName,
            email: seed.email,
            walletAddress: fakeAddress("G", `contractor-${seed.email}`),
          },
        }),
      ),
    );
    const contractorByEmail = new Map(contractors.map((contractor) => [contractor.email, contractor]));
    const samBuilder = requireByKey(contractorByEmail, "sam@contractors.xyz");
    const taylorDesigner = requireByKey(contractorByEmail, "taylor@contractors.xyz");

    const completedRun = await prisma.payrollRun.upsert({
      where: { id: `${organization.id}-payroll-run-completed` },
      update: {},
      create: {
        id: `${organization.id}-payroll-run-completed`,
        organizationId: organization.id,
        payPeriodStart: new Date("2026-06-01"),
        payPeriodEnd: new Date("2026-06-30"),
        status: "COMPLETED",
        totalAmount: "9000",
        createdById: finance.id,
        items: {
          connectOrCreate: [
            {
              where: { id: `${organization.id}-payroll-item-jane-june` },
              create: {
                id: `${organization.id}-payroll-item-jane-june`,
                employeeId: janeDoe.id,
                amount: "6000",
                status: "PAID",
                stellarTxHash: fakeTxHash("payroll-jane-june"),
              },
            },
            {
              where: { id: `${organization.id}-payroll-item-john-june` },
              create: {
                id: `${organization.id}-payroll-item-john-june`,
                employeeId: johnRoe.id,
                amount: "3000",
                status: "PAID",
                stellarTxHash: fakeTxHash("payroll-john-june"),
              },
            },
          ],
        },
      },
    });

    await prisma.payrollRun.upsert({
      where: { id: `${organization.id}-payroll-run-draft` },
      update: {},
      create: {
        id: `${organization.id}-payroll-run-draft`,
        organizationId: organization.id,
        payPeriodStart: new Date("2026-07-01"),
        payPeriodEnd: new Date("2026-07-31"),
        status: "DRAFT",
        totalAmount: "9000",
        createdById: finance.id,
        items: {
          connectOrCreate: [
            {
              where: { id: `${organization.id}-payroll-item-jane-july` },
              create: {
                id: `${organization.id}-payroll-item-jane-july`,
                employeeId: janeDoe.id,
                amount: "6000",
                status: "PENDING",
              },
            },
            {
              where: { id: `${organization.id}-payroll-item-john-july` },
              create: {
                id: `${organization.id}-payroll-item-john-july`,
                employeeId: johnRoe.id,
                amount: "3000",
                status: "PENDING",
              },
            },
          ],
        },
      },
    });

    const releasedMilestone = await prisma.milestone.upsert({
      where: { id: `${organization.id}-milestone-mockups` },
      update: {},
      create: {
        id: `${organization.id}-milestone-mockups`,
        organizationId: organization.id,
        contractorId: samBuilder.id,
        onChainMilestoneId: 1n,
        title: "Design mockups",
        description: "Initial mockups for the dashboard redesign.",
        amount: "1500",
        status: "RELEASED",
        stellarTxHash: fakeTxHash("milestone-mockups-release"),
        createdById: finance.id,
      },
    });

    const fundedMilestone = await prisma.milestone.upsert({
      where: { id: `${organization.id}-milestone-landing-page` },
      update: {},
      create: {
        id: `${organization.id}-milestone-landing-page`,
        organizationId: organization.id,
        contractorId: taylorDesigner.id,
        onChainMilestoneId: 2n,
        title: "Landing page",
        description: "Marketing landing page build.",
        amount: "2000",
        status: "FUNDED",
        stellarTxHash: fakeTxHash("milestone-landing-page-fund"),
        createdById: finance.id,
      },
    });

    await prisma.wallet.upsert({
      where: { address: organization.treasuryContractAddr },
      update: {},
      create: {
        organizationId: organization.id,
        address: organization.treasuryContractAddr,
        label: "Treasury",
        isTreasury: true,
      },
    });

    const transactionSeeds = [
      {
        stellarTxHash: fakeTxHash("deposit-initial"),
        type: "DEPOSIT" as const,
        amount: "20000",
        from: owner.primaryWallet!,
        to: organization.treasuryContractAddr,
        ledgerSequence: 1000n,
      },
      {
        stellarTxHash: fakeTxHash("payroll-jane-june"),
        type: "PAYROLL_DISBURSEMENT" as const,
        amount: "6000",
        from: organization.treasuryContractAddr,
        to: janeDoe.walletAddress,
        ledgerSequence: 1001n,
        relatedEntityType: "PayrollRun",
        relatedEntityId: completedRun.id,
      },
      {
        stellarTxHash: fakeTxHash("payroll-john-june"),
        type: "PAYROLL_DISBURSEMENT" as const,
        amount: "3000",
        from: organization.treasuryContractAddr,
        to: johnRoe.walletAddress,
        ledgerSequence: 1002n,
        relatedEntityType: "PayrollRun",
        relatedEntityId: completedRun.id,
      },
      {
        stellarTxHash: fakeTxHash("milestone-landing-page-fund"),
        type: "MILESTONE_FUND" as const,
        amount: "2000",
        from: organization.treasuryContractAddr,
        to: fakeAddress("C", "milestone-engine"),
        ledgerSequence: 1003n,
        relatedEntityType: "Milestone",
        relatedEntityId: fundedMilestone.id,
      },
      {
        stellarTxHash: fakeTxHash("milestone-mockups-release"),
        type: "MILESTONE_RELEASE" as const,
        amount: "1500",
        from: fakeAddress("C", "milestone-engine"),
        to: samBuilder.walletAddress,
        ledgerSequence: 1004n,
        relatedEntityType: "Milestone",
        relatedEntityId: releasedMilestone.id,
      },
    ];

    await Promise.all(
      transactionSeeds.map((seed) => {
        const stellarEventId = `${seed.stellarTxHash}-seed`;
        return prisma.transaction.upsert({
          where: { stellarEventId },
          update: {},
          create: {
            organizationId: organization.id,
            type: seed.type,
            status: "CONFIRMED",
            amount: seed.amount,
            fromAddress: seed.from,
            toAddress: seed.to,
            stellarTxHash: seed.stellarTxHash,
            stellarEventId,
            ledgerSequence: seed.ledgerSequence,
            relatedEntityType: seed.relatedEntityType,
            relatedEntityId: seed.relatedEntityId,
          },
        });
      }),
    );

    console.log(`Seeded demo organization "${organization.name}" (${organization.slug}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
