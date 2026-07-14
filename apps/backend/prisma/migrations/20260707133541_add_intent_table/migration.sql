-- CreateEnum
CREATE TYPE "IntentType" AS ENUM ('TREASURY_DEPOSIT', 'TREASURY_WITHDRAW');

-- CreateTable
CREATE TABLE "intents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "IntentType" NOT NULL,
    "unsignedXdr" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intents_organizationId_idx" ON "intents"("organizationId");

-- AddForeignKey
ALTER TABLE "intents" ADD CONSTRAINT "intents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intents" ADD CONSTRAINT "intents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
