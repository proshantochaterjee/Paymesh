-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntentType" ADD VALUE 'ORGANIZATION_CREATE';
ALTER TYPE "IntentType" ADD VALUE 'ORGANIZATION_GRANT_ROLE';
ALTER TYPE "IntentType" ADD VALUE 'ORGANIZATION_REVOKE_ROLE';

-- AlterTable
ALTER TABLE "intents" ALTER COLUMN "organizationId" DROP NOT NULL;
