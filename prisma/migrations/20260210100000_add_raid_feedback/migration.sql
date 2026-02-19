-- CreateEnum
CREATE TYPE "RaidMood" AS ENUM ('GREAT', 'OKAY', 'FRUSTRATING');

-- CreateTable
CREATE TABLE "RaidFeedback" (
    "id" TEXT NOT NULL,
    "raidId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mood" "RaidMood" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaidFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RaidFeedback_raidId_userId_key" ON "RaidFeedback"("raidId", "userId");

-- CreateIndex
CREATE INDEX "RaidFeedback_raidId_mood_idx" ON "RaidFeedback"("raidId", "mood");

-- AddForeignKey
ALTER TABLE "RaidFeedback" ADD CONSTRAINT "RaidFeedback_raidId_fkey" FOREIGN KEY ("raidId") REFERENCES "Raid"("id") ON DELETE CASCADE ON UPDATE CASCADE;