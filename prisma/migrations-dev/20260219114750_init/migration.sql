-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "raidRoles" TEXT DEFAULT '',
    "raidLeaderRoles" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'en',
    "timezoneOffset" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archiveChannelId" TEXT,
    "autoArchive" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "wowClass" TEXT,
    "wowSpec" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserPreference_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Raid" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "raidDate" DATETIME NOT NULL,
    "description" TEXT,
    "roles" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "templateName" TEXT,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdFromTemplateId" TEXT,
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "clonedAt" DATETIME,
    "archivedAt" DATETIME,
    "archiveChannelId" TEXT,
    "archiveMessageId" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Raid_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RaidAttendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "raidId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'attending',
    "wowClass" TEXT,
    "wowSpec" TEXT,
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "optoutReason" TEXT,
    "playerNote" TEXT,
    "notedAt" DATETIME,
    "guildId" TEXT NOT NULL,
    CONSTRAINT "RaidAttendance_raidId_fkey" FOREIGN KEY ("raidId") REFERENCES "Raid" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RaidAttendance_userId_guildId_fkey" FOREIGN KEY ("userId", "guildId") REFERENCES "UserPreference" ("userId", "guildId") ON DELETE RESTRICT ON UPDATE CASCADE
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
CREATE INDEX "RaidAttendance_raidId_status_idx" ON "RaidAttendance"("raidId", "status");

-- CreateIndex
CREATE INDEX "RaidAttendance_userId_guildId_status_idx" ON "RaidAttendance"("userId", "guildId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RaidAttendance_raidId_userId_key" ON "RaidAttendance"("raidId", "userId");
