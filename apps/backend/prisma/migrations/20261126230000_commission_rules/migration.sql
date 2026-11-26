-- CreateEnum
CREATE TYPE "CommissionBeneficiary" AS ENUM ('OWNER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "CommissionRuleBase" AS ENUM ('MARGIN', 'MALODGE_SHARE', 'PRICE', 'FIXED');

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "beneficiary" "CommissionBeneficiary" NOT NULL,
    "personId" TEXT,
    "villaId" TEXT,
    "categoryId" TEXT,
    "serviceId" TEXT,
    "base" "CommissionRuleBase" NOT NULL,
    "rate" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionRule_beneficiary_idx" ON "CommissionRule"("beneficiary");

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_personId_fkey" FOREIGN KEY ("personId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_villaId_fkey" FOREIGN KEY ("villaId") REFERENCES "Villa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

