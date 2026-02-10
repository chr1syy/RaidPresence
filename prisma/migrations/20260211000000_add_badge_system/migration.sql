-- CreateEnum
CREATE TYPE "BadgeType" AS ENUM ('PERFECT_ATTENDANCE', 'TANK_MAIN', 'HEALER_HERO', 'DAMAGE_DEALER', 'SHARPSHOOTER', 'ALWAYS_ON_TIME', 'EARLY_BIRD', 'TEAM_PLAYER', 'RELIABLE_MEMBER', 'RISING_STAR', 'VETERAN_RAIDER', 'LEADERS_CHOICE');

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "badgeType" "BadgeType" NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "awardedBy" TEXT,
    "reason" TEXT,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerBadgeView" (
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "badges" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerBadgeView_pkey" PRIMARY KEY ("userId","guildId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Badge_userId_guildId_badgeType_key" ON "Badge"("userId", "guildId", "badgeType");

-- CreateIndex
CREATE INDEX "Badge_userId_guildId_idx" ON "Badge"("userId", "guildId");

-- CreateIndex
CREATE INDEX "Badge_guildId_badgeType_idx" ON "Badge"("guildId", "badgeType");
