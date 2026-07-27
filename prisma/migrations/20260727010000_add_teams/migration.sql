-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Team_guildId_idx" ON "Team"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_guildId_name_key" ON "Team"("guildId", "name");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MigrateData: every existing guild gets exactly one default team ("Main")
INSERT INTO "Team" ("id", "guildId", "name", "isDefault", "createdBy", "createdAt", "updatedAt")
SELECT md5(random()::text || g."id"), g."id", 'Main', true, 'system', NOW(), NOW()
FROM "Guild" g;

-- AlterTable: add team references as nullable first so the backfill can run
ALTER TABLE "Raid" ADD COLUMN "teamId" TEXT;
ALTER TABLE "RaidAttendance" ADD COLUMN "teamId" TEXT;

-- MigrateData: point existing raids at their guild's default team
UPDATE "Raid" r SET "teamId" = t."id"
FROM "Team" t
WHERE t."guildId" = r."guildId" AND t."isDefault" = true;

-- MigrateData: attendance inherits the team of its raid
UPDATE "RaidAttendance" a SET "teamId" = t."id"
FROM "Raid" r
JOIN "Team" t ON t."id" = r."teamId"
WHERE a."raidId" = r."id";

-- AlterTable: the backfill is complete, so the column becomes mandatory
ALTER TABLE "Raid" ALTER COLUMN "teamId" SET NOT NULL;
ALTER TABLE "RaidAttendance" ALTER COLUMN "teamId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Raid" ADD CONSTRAINT "Raid_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Raid_teamId_status_idx" ON "Raid"("teamId", "status");

-- CreateIndex
CREATE INDEX "Raid_teamId_raidDate_idx" ON "Raid"("teamId", "raidDate");

-- CreateIndex
CREATE INDEX "RaidAttendance_teamId_userId_status_idx" ON "RaidAttendance"("teamId", "userId", "status");
