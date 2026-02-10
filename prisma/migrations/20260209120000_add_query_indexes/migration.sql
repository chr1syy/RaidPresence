-- CreateIndex
CREATE INDEX "Raid_guildId_status_idx" ON "Raid"("guildId", "status");

-- CreateIndex
CREATE INDEX "Raid_raidDate_idx" ON "Raid"("raidDate");

-- CreateIndex
CREATE INDEX "RaidAttendance_raidId_status_idx" ON "RaidAttendance"("raidId", "status");

-- CreateIndex
CREATE INDEX "RaidAttendance_userId_guildId_status_idx" ON "RaidAttendance"("userId", "guildId", "status");
