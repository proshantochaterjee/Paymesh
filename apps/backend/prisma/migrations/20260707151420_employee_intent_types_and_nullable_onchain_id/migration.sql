-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntentType" ADD VALUE 'EMPLOYEE_REGISTER';
ALTER TYPE "IntentType" ADD VALUE 'EMPLOYEE_UPDATE';
ALTER TYPE "IntentType" ADD VALUE 'EMPLOYEE_DEACTIVATE';

-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "onChainEmployeeId" DROP NOT NULL;
