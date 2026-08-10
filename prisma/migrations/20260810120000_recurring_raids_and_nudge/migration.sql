-- Weekly recurring raid series + the post-raid nudge.
--
-- Until now nothing in the bot ever produced a second raid week: the scheduler closed
-- a raid and went quiet forever. A series is modelled as a chain on `Raid` rather than
-- as its own table — every generated instance points at the raid it came from, and the
-- UNIQUE index on that pointer is what makes the scheduler crash-safe: a second attempt
-- to generate the same successor is rejected by the database instead of duplicating it.
--
-- ADDITIVE AND NON-DESTRUCTIVE: only new nullable/defaulted columns and new indexes.
-- No existing row is rewritten and no column is dropped. Existing raids get
-- `recurrenceRule = NULL` (one-off, unchanged behaviour) and `nudgeSentAt = NULL`.
-- `recurrenceActive` defaults to true but is only ever read together with a non-null
-- `recurrenceRule`, so it is inert on every pre-existing row.
--
-- RE-RUNNABLE: every statement is guarded, so a partially applied attempt can simply
-- be replayed.

ALTER TABLE "Raid" ADD COLUMN IF NOT EXISTS "recurrenceRule" TEXT;
ALTER TABLE "Raid" ADD COLUMN IF NOT EXISTS "recurrenceParentId" TEXT;
ALTER TABLE "Raid" ADD COLUMN IF NOT EXISTS "recurrenceActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Raid" ADD COLUMN IF NOT EXISTS "recurrenceSilentStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Raid" ADD COLUMN IF NOT EXISTS "nudgeSentAt" TIMESTAMP(3);
ALTER TABLE "Raid" ADD COLUMN IF NOT EXISTS "nudgeMessageId" TEXT;

ALTER TABLE "RaidAttendance" ADD COLUMN IF NOT EXISTS "interactedAt" TIMESTAMP(3);

-- At most one successor per raid. This is the idempotency guarantee for the scheduler:
-- if it crashes between closing a raid and creating the next instance, the retry either
-- succeeds or is rejected here — it can never post the same raid week twice.
CREATE UNIQUE INDEX IF NOT EXISTS "Raid_recurrenceParentId_key" ON "Raid"("recurrenceParentId");

-- The series pass runs this predicate every 2 minutes.
CREATE INDEX IF NOT EXISTS "Raid_recurrenceRule_recurrenceActive_status_idx"
  ON "Raid"("recurrenceRule", "recurrenceActive", "status");

-- ON DELETE SET NULL: deleting a raid must not cascade into the rest of its series.
-- The successor simply loses its lineage pointer and keeps running.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Raid_recurrenceParentId_fkey'
  ) THEN
    ALTER TABLE "Raid"
      ADD CONSTRAINT "Raid_recurrenceParentId_fkey"
      FOREIGN KEY ("recurrenceParentId") REFERENCES "Raid"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
