-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "accessVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Villa" ADD COLUMN     "managementFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.2;

-- CreateTable
CREATE TABLE "OwnerStatement" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "totalDue" DOUBLE PRECISION NOT NULL,
    "data" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sentTo" TEXT,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnerStatement_month_idx" ON "OwnerStatement"("month");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerStatement_ownerId_month_key" ON "OwnerStatement"("ownerId", "month");

-- AddForeignKey
ALTER TABLE "OwnerStatement" ADD CONSTRAINT "OwnerStatement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
