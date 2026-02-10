-- Add archive system fields to Guild
ALTER TABLE "Guild" ADD COLUMN "archiveChannelId" TEXT;
ALTER TABLE "Guild" ADD COLUMN "autoArchive" BOOLEAN NOT NULL DEFAULT false;

-- Add archive system fields to Raid
ALTER TABLE "Raid" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Raid" ADD COLUMN "archiveChannelId" TEXT;
ALTER TABLE "Raid" ADD COLUMN "archiveMessageId" TEXT;
ALTER TABLE "Raid" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;

-- Create index for efficient archive queries
CREATE INDEX "Raid_guildId_archivedAt_idx" ON "Raid"("guildId", "archivedAt");
