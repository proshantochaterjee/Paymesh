# Database Schema

PostgreSQL via Prisma. This is the off-chain source of truth for
organizational data and an indexed projection of on-chain events — never
the source of truth for current balances (see
[TREASURY_ARCHITECTURE.md](./TREASURY_ARCHITECTURE.md) §2).

## Entity summary

| Entity | Purpose |
|---|---|
| `User` | Login identity (email/password and/or wallet) |
| `Session` | Active auth sessions (Better Auth) |
| `Account` | Login-method credentials linked to a `User` (Better Auth; e.g. the email/password hash) |
| `Verification` | Short-lived identifier->value store with single-use consume (Better Auth; used for the wallet challenge nonce) |
| `Jwks` | Rotating signing keys for bearer-mode JWTs (Better Auth `jwt` plugin) |
| `Organization` | Workspace; mirrors on-chain `organization`/`treasury` addresses |
| `OrganizationMember` | User <-> Organization join with role |
| `Department` | Optional grouping for employees |
| `Employee` | Off-chain HR record; links to on-chain `employee_registry` entry |
| `Contractor` | Off-chain contractor record |
| `PayrollRun` | A payroll execution batch (see [PAYROLL_ENGINE.md](./PAYROLL_ENGINE.md)) |
| `PayrollItem` | One employee's line item within a run |
| `Milestone` | Contractor milestone (see [MILESTONE_ENGINE.md](./MILESTONE_ENGINE.md)) |
| `Transaction` | Normalized projection of on-chain events, written by the Event Indexer |
| `Wallet` | Known wallet addresses associated with a user or org (treasury, signer) |
| `AuditLog` | Immutable record of state-changing actions |
| `Intent` | Short-lived built-but-unsigned XDR transaction, keyed by `intentId` (docs/BACKEND_ARCHITECTURE.md §5) |
| `IndexerCursor` | Per-contract last-processed ledger sequence |

## Prisma schema (canonical)

```prisma
// apps/backend/prisma/schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum OrgRole {
  OWNER
  ADMIN
  FINANCE
  HR
  VIEWER
}

enum EmployeeStatus {
  ACTIVE
  INACTIVE
}

enum ContractorStatus {
  ACTIVE
  INACTIVE
}

enum PayFrequency {
  WEEKLY
  BI_WEEKLY
  MONTHLY
}

enum PayrollRunStatus {
  DRAFT
  SCHEDULED
  EXECUTING
  COMPLETED
  PARTIAL
  FAILED
}

enum PayrollItemStatus {
  PENDING
  PAID
  FAILED
}

enum MilestoneStatus {
  DRAFT
  FUNDED
  APPROVED
  RELEASED
  CANCELLED
}

enum TransactionType {
  DEPOSIT
  WITHDRAWAL
  PAYROLL_DISBURSEMENT
  MILESTONE_FUND
  MILESTONE_RELEASE
  MILESTONE_REFUND
}

enum TransactionStatus {
  SUBMITTED
  CONFIRMED
  FAILED
}

enum IntentType {
  TREASURY_DEPOSIT
  TREASURY_WITHDRAW
  EMPLOYEE_REGISTER
  EMPLOYEE_UPDATE
  EMPLOYEE_DEACTIVATE
  PAYROLL_EXECUTE
  MILESTONE_CREATE
  MILESTONE_FUND
  MILESTONE_APPROVE
  MILESTONE_RELEASE
  MILESTONE_CANCEL
}

// Fields below `updatedAt` are Better Auth's core user schema (introduced
// Step 7 — see DEVELOPMENT_PLAN.md's Step 7 spec-gap note): `name` and
// `email` stay nullable because a wallet-only user has neither; Better
// Auth's own request-level validation on /auth/register still requires
// them for that flow specifically, enforced in AuthService, not the DB.
// Password hashes live on `Account` (Better Auth's credential provider
// convention), not here — `passwordHash` (Step 6) was removed in Step 7.
model User {
  id            String   @id @default(cuid())
  email         String?  @unique
  name          String?
  emailVerified Boolean  @default(false)
  image         String?
  primaryWallet String?  @unique
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  memberships OrganizationMember[]
  sessions    Session[]
  accounts    Account[]
  wallets     Wallet[]
  auditLogs   AuditLog[]
  intents     Intent[]

  @@map("users")
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("sessions")
}

// Better Auth: one row per login method linked to a User — the
// email/password credential (providerId = "credential", password = argon2id
// hash) today, room for a real OAuth provider later without a schema
// change. See AUTHENTICATION.md.
model Account {
  id                    String    @id @default(cuid())
  accountId             String
  providerId            String
  userId                String
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("accounts")
}

// Better Auth: short-lived identifier->value store with atomic single-use
// consume, used for the wallet challenge nonce (AUTHENTICATION.md §2)
// instead of a separate bespoke table — same TTL/single-use properties.
model Verification {
  id         String   @id @default(cuid())
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
  @@map("verifications")
}

// Better Auth `jwt` plugin: rotating signing keys for the short-lived
// bearer-mode access tokens (AUTHENTICATION.md §4).
model Jwks {
  id         String    @id @default(cuid())
  publicKey  String
  privateKey String
  createdAt  DateTime  @default(now())
  expiresAt  DateTime?

  @@map("jwks")
}

model Organization {
  id                        String   @id @default(cuid())
  name                      String
  slug                      String   @unique
  onChainOrgId              BigInt   @unique
  organizationContractAddr  String   @unique
  treasuryContractAddr      String   @unique
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt

  members      OrganizationMember[]
  departments  Department[]
  employees    Employee[]
  contractors  Contractor[]
  payrollRuns  PayrollRun[]
  milestones   Milestone[]
  transactions Transaction[]
  wallets      Wallet[]
  auditLogs    AuditLog[]
  intents      Intent[]

  @@map("organizations")
}

model OrganizationMember {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  role           OrgRole
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
  @@index([userId])
  @@map("organization_members")
}

model Department {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  employees    Employee[]

  @@unique([organizationId, name])
  @@map("departments")
}

// onChainEmployeeId is nullable by design — NULL means "Postgres row
// exists, on-chain registration hasn't been confirmed yet" (the two-phase
// creation pattern, docs/EMPLOYEE_MODEL.md §3; non-nullable in Step 6,
// before that pattern was implemented in Step 10).
model Employee {
  id                 String         @id @default(cuid())
  organizationId     String
  departmentId       String?
  onChainEmployeeId  BigInt?
  fullName           String
  email              String
  walletAddress      String
  salaryAmount       Decimal        @db.Decimal(20, 7)
  salaryCurrency     String         @default("USDC")
  payFrequency       PayFrequency
  status             EmployeeStatus @default(ACTIVE)
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt

  organization Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  department   Department?   @relation(fields: [departmentId], references: [id], onDelete: SetNull)
  payrollItems PayrollItem[]

  @@unique([organizationId, onChainEmployeeId])
  @@index([organizationId, status])
  @@map("employees")
}

model Contractor {
  id             String            @id @default(cuid())
  organizationId String
  fullName       String
  email          String
  walletAddress  String
  status         ContractorStatus  @default(ACTIVE)
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  milestones   Milestone[]

  @@index([organizationId, status])
  @@map("contractors")
}

model PayrollRun {
  id             String             @id @default(cuid())
  organizationId String
  payPeriodStart DateTime
  payPeriodEnd   DateTime
  status         PayrollRunStatus   @default(DRAFT)
  totalAmount    Decimal            @db.Decimal(20, 7)
  createdById    String
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  organization Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  items        PayrollItem[]

  @@index([organizationId, status])
  @@map("payroll_runs")
}

model PayrollItem {
  id             String             @id @default(cuid())
  payrollRunId   String
  employeeId     String
  amount         Decimal            @db.Decimal(20, 7)
  status         PayrollItemStatus  @default(PENDING)
  stellarTxHash  String?
  failureReason  String?
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  payrollRun PayrollRun @relation(fields: [payrollRunId], references: [id], onDelete: Cascade)
  employee   Employee   @relation(fields: [employeeId], references: [id], onDelete: Restrict)

  @@index([payrollRunId])
  @@index([employeeId])
  @@map("payroll_items")
}

model Milestone {
  id                 String          @id @default(cuid())
  organizationId     String
  contractorId       String
  onChainMilestoneId BigInt?
  title              String
  description        String?
  amount             Decimal         @db.Decimal(20, 7)
  status             MilestoneStatus @default(DRAFT)
  stellarTxHash      String?
  createdById        String
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  contractor   Contractor   @relation(fields: [contractorId], references: [id], onDelete: Restrict)

  @@index([organizationId, status])
  @@index([contractorId])
  @@map("milestones")
}

model Transaction {
  id             String             @id @default(cuid())
  organizationId String
  type           TransactionType
  status         TransactionStatus
  amount         Decimal            @db.Decimal(20, 7)
  asset          String             @default("USDC")
  fromAddress    String
  toAddress      String
  stellarTxHash  String
  stellarEventId String             @unique
  ledgerSequence BigInt
  relatedEntityType String?         // "PayrollRun" | "PayrollItem" | "Milestone"
  relatedEntityId   String?
  createdAt      DateTime           @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, type, createdAt])
  @@index([ledgerSequence])
  @@map("transactions")
}

model Wallet {
  id             String   @id @default(cuid())
  organizationId String?
  userId         String?
  address        String   @unique
  label          String?
  isTreasury     Boolean  @default(false)
  createdAt      DateTime @default(now())

  organization Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User?         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("wallets")
}

model AuditLog {
  id             String   @id @default(cuid())
  organizationId String
  actorUserId    String
  action         String
  entityType     String
  entityId       String
  metadata       Json?
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  actor        User         @relation(fields: [actorUserId], references: [id], onDelete: Restrict)

  @@index([organizationId, createdAt])
  @@map("audit_logs")
}

// Short-lived: a built-but-not-yet-submitted unsigned XDR transaction
// (docs/BACKEND_ARCHITECTURE.md §5). Not one of this doc's core entities
// above since it's ephemeral infrastructure state — persisted (not
// in-memory) so an intent survives a backend restart between build and
// submit. `expiresAt` gates reuse at read time; no scheduled cleanup job
// exists yet (that lands with BullMQ in Step 13) — a handful of expired,
// unconsumed rows are harmless until then.
model Intent {
  id             String     @id @default(cuid())
  organizationId String
  type           IntentType
  unsignedXdr    String
  expiresAt      DateTime
  consumedAt     DateTime?
  createdById    String
  metadata       Json?
  createdAt      DateTime   @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdBy    User         @relation(fields: [createdById], references: [id], onDelete: Restrict)

  @@index([organizationId])
  @@map("intents")
}

model IndexerCursor {
  id                String   @id @default(cuid())
  contractAddress   String   @unique
  lastLedgerSequence BigInt
  updatedAt         DateTime @updatedAt

  @@map("indexer_cursors")
}
```

## Constraints & invariants not expressible in Prisma alone

- `PayrollItem.amount` must equal the `Employee.salaryAmount` snapshot at
  `PayrollRun` creation time — enforced in application code at creation,
  not recomputed later even if `Employee.salaryAmount` changes.
- `Transaction.stellarEventId` uniqueness makes indexer upserts idempotent
  — reprocessing the same ledger range on indexer restart cannot create
  duplicate rows. Corrected in Step 13 from an original `stellarTxHash`
  uniqueness plan: one transaction can emit several relevant events (e.g.
  one payroll chunk's `run_payroll` call transfers to several employees),
  so the tx hash alone can't be the key — see
  [EVENT_INDEXING.md](./EVENT_INDEXING.md) §8.
- `Employee.onChainEmployeeId` + `organizationId` uniqueness mirrors the
  contract's `(org_id, employee_id)` key exactly.
- Every `BigInt` column here (`onChainOrgId`, `onChainEmployeeId`,
  `onChainMilestoneId`, `ledgerSequence`, `lastLedgerSequence`) is exposed
  over the API as a JSON string, not a number — native `JSON.stringify`
  can't serialize a raw `BigInt` at all (throws), and a `BigInt` too must
  round-trip losslessly for a `u64` on-chain ID beyond `Number`'s safe
  integer range. `apps/backend/src/common/bigint-json.polyfill.ts` adds a
  global `BigInt.prototype.toJSON` (imported once, for its side effect, at
  the top of `app.module.ts`) so this is automatic for every response
  rather than a per-endpoint conversion — discovered in Step 10 the first
  time an endpoint actually returned a populated `BigInt` column
  (`Employee.onChainEmployeeId`) in a live response.
- Soft-delete only: `Employee.status`/`Contractor.status` flip to
  `INACTIVE`; rows are never hard-deleted so `PayrollItem`/`Milestone`
  foreign keys remain valid (`onDelete: Restrict` on those relations).

## Migration strategy

- Prisma Migrate, one migration per schema change, committed to
  `apps/backend/prisma/migrations`.
- No destructive migrations (column drops/type changes) without a
  two-step expand-and-contract process: add new column/backfill in one
  migration + deploy, remove old column in a later migration once code no
  longer reads it.
- Seed script (`scripts/seed-db.ts`) creates a demo organization with
  sample employees/contractors/payroll history for local dev and the SCF
  demo, never run against a production-like database automatically.

Full relationship diagram in [ER_DIAGRAM.md](./ER_DIAGRAM.md).
