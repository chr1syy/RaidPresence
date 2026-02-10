-- Add raid notes fields to RaidAttendance
ALTER TABLE "RaidAttendance" ADD COLUMN "optoutReason" TEXT;
ALTER TABLE "RaidAttendance" ADD COLUMN "playerNote" TEXT;
ALTER TABLE "RaidAttendance" ADD COLUMN "notedAt" TIMESTAMP(3);
