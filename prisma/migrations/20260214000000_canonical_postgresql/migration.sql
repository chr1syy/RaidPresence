-- CreateEnum
CREATE TYPE "BadgeType" AS ENUM ('PERFECT_ATTENDANCE', 'TANK_MAIN', 'HEALER_HERO', 'DAMAGE_DEALER', 'SHARPSHOOTER', 'ALWAYS_ON_TIME', 'EARLY_BIRD', 'TEAM_PLAYER', 'RELIABLE_MEMBER', 'RISING_STAR', 'VETERAN_RAIDER', 'LEADERS_CHOICE');

-- CreateEnum
CREATE TYPE "RaidMood" AS ENUM ('GREAT', 'OKAY', 'FRUSTRATING');

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "raidRoles" TEXT NOT NULL,
    "raidLeaderRoles" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'en',
    "timezoneOffset" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archiveChannelId" TEXT,
    "autoArchive" BOOLEAN NOT NULL DEFAULT false,
    "autoPurgeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoPurgeDays" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "wowClass" TEXT,
    "wowSpec" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Raid" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "raidDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "roles" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateName" TEXT,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdFromTemplateId" TEXT,
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "clonedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "archiveChannelId" TEXT,
    "archiveMessageId" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Raid_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "RaidAttendance" (
    "id" TEXT NOT NULL,
    "raidId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'attending',
    "wowClass" TEXT,
    "wowSpec" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "optoutReason" TEXT,
    "playerNote" TEXT,
    "notedAt" TIMESTAMP(3),
    "guildId" TEXT NOT NULL,

    CONSTRAINT "RaidAttendance_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "UserPreference_userId_guildId_key" ON "UserPreference"("userId", "guildId");

-- CreateIndex
CREATE INDEX "Raid_guildId_status_idx" ON "Raid"("guildId", "status");

-- CreateIndex
CREATE INDEX "Raid_raidDate_idx" ON "Raid"("raidDate");

-- CreateIndex
CREATE INDEX "Raid_guildId_raidDate_idx" ON "Raid"("guildId", "raidDate");

-- CreateIndex
CREATE INDEX "Raid_guildId_archivedAt_idx" ON "Raid"("guildId", "archivedAt");

-- CreateIndex
CREATE INDEX "Badge_userId_guildId_idx" ON "Badge"("userId", "guildId");

-- CreateIndex
CREATE INDEX "Badge_guildId_badgeType_idx" ON "Badge"("guildId", "badgeType");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_userId_guildId_badgeType_key" ON "Badge"("userId", "guildId", "badgeType");

-- CreateIndex
CREATE INDEX "RaidAttendance_raidId_status_idx" ON "RaidAttendance"("raidId", "status");

-- CreateIndex
CREATE INDEX "RaidAttendance_userId_guildId_status_idx" ON "RaidAttendance"("userId", "guildId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RaidAttendance_raidId_userId_key" ON "RaidAttendance"("raidId", "userId");

-- CreateIndex
CREATE INDEX "RaidFeedback_raidId_mood_idx" ON "RaidFeedback"("raidId", "mood");

-- CreateIndex
CREATE UNIQUE INDEX "RaidFeedback_raidId_userId_key" ON "RaidFeedback"("raidId", "userId");

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Raid" ADD CONSTRAINT "Raid_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaidAttendance" ADD CONSTRAINT "RaidAttendance_raidId_fkey" FOREIGN KEY ("raidId") REFERENCES "Raid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaidAttendance" ADD CONSTRAINT "RaidAttendance_userId_guildId_fkey" FOREIGN KEY ("userId", "guildId") REFERENCES "UserPreference"("userId", "guildId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaidFeedback" ADD CONSTRAINT "RaidFeedback_raidId_fkey" FOREIGN KEY ("raidId") REFERENCES "Raid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

