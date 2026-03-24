-- CreateEnum
CREATE TYPE "PremiumTier" AS ENUM ('FREE', 'PREMIUM', 'PRO');

-- AlterTable
ALTER TABLE "Guild" ADD COLUMN "premiumTier" "PremiumTier" NOT NULL DEFAULT 'FREE',
ADD COLUMN "premiumExpiresAt" TIMESTAMP(3),
ADD COLUMN "entitlementId" TEXT,
ADD COLUMN "weeklyRaidCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "weeklyRaidCountResetAt" TIMESTAMP(3),
ADD COLUMN "trialStartedAt" TIMESTAMP(3);
