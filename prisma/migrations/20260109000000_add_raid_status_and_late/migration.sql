-- AlterTable
ALTER TABLE "Raid" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'open';

-- Update comment for RaidAttendance status to reflect new "late" option
COMMENT ON COLUMN "RaidAttendance"."status" IS 'attending, opted_out, or late';
