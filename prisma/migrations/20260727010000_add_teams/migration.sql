-- Rerunnable: DDL uses IF NOT EXISTS (constraints, which have no such clause, are guarded
-- against pg_constraint) and the backfills only touch rows that are still unmigrated.
-- Order is preserved: data is backfilled before the columns become NOT NULL.

-- CreateTable
CREATE TABLE IF NOT EXISTS "Team" (
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
CREATE INDEX IF NOT EXISTS "Team_guildId_idx" ON "Team"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Team_guildId_name_key" ON "Team"("guildId", "name");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Team_guildId_fkey') THEN
    ALTER TABLE "Team" ADD CONSTRAINT "Team_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- MigrateData: every existing guild gets exactly one default team ("Main").
-- Guilds that already have a default team are skipped, so a rerun adds nothing.
INSERT INTO "Team" ("id", "guildId", "name", "isDefault", "createdBy", "createdAt", "updatedAt")
SELECT md5(random()::text || g."id"), g."id", 'Main', true, 'system', NOW(), NOW()
FROM "Guild" g
WHERE NOT EXISTS (
  SELECT 1 FROM "Team" t WHERE t."guildId" = g."id" AND t."isDefault" = true
);

-- AlterTable: add team references as nullable first so the backfill can run
ALTER TABLE "Raid" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
ALTER TABLE "RaidAttendance" ADD COLUMN IF NOT EXISTS "teamId" TEXT;

-- MigrateData: point existing raids at their guild's default team
UPDATE "Raid" r SET "teamId" = t."id"
FROM "Team" t
WHERE t."guildId" = r."guildId" AND t."isDefault" = true AND r."teamId" IS NULL;

-- MigrateData: attendance inherits the team of its raid
UPDATE "RaidAttendance" a SET "teamId" = t."id"
FROM "Raid" r
JOIN "Team" t ON t."id" = r."teamId"
WHERE a."raidId" = r."id" AND a."teamId" IS NULL;

-- AlterTable: the backfill is complete, so the column becomes mandatory
-- (SET NOT NULL is a no-op on an already NOT NULL column)
ALTER TABLE "Raid" ALTER COLUMN "teamId" SET NOT NULL;
ALTER TABLE "RaidAttendance" ALTER COLUMN "teamId" SET NOT NULL;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Raid_teamId_fkey') THEN
    ALTER TABLE "Raid" ADD CONSTRAINT "Raid_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Raid_teamId_status_idx" ON "Raid"("teamId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Raid_teamId_raidDate_idx" ON "Raid"("teamId", "raidDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RaidAttendance_teamId_userId_status_idx" ON "RaidAttendance"("teamId", "userId", "status");
