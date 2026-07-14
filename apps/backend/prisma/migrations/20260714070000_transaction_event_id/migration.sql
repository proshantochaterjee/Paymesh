-- Backfill stellarEventId for pre-existing rows (seed data has no real
-- Soroban RPC event id) using the row's own cuid, which is already
-- globally unique, before enforcing NOT NULL + UNIQUE.
ALTER TABLE "transactions" ADD COLUMN "stellarEventId" TEXT;
UPDATE "transactions" SET "stellarEventId" = "id" || '-seed' WHERE "stellarEventId" IS NULL;
ALTER TABLE "transactions" ALTER COLUMN "stellarEventId" SET NOT NULL;

-- docs/EVENT_INDEXING.md §4: a single tx can emit several relevant events
-- (e.g. one payroll chunk's run_payroll call transfers to several
-- employees), so stellarTxHash can no longer be the uniqueness key.
DROP INDEX IF EXISTS "transactions_stellarTxHash_key";
CREATE UNIQUE INDEX "transactions_stellarEventId_key" ON "transactions"("stellarEventId");
CREATE INDEX "transactions_stellarTxHash_idx" ON "transactions"("stellarTxHash");
