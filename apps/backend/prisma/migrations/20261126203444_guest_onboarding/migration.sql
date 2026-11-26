-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "accessVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "invitedAt" TIMESTAMP(3),
ADD COLUMN     "journey" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Villa" ADD COLUMN     "welcomeGuide" JSONB NOT NULL DEFAULT '{}';
