-- Phase 1 of 2: add the IANA `timezone` column alongside the legacy integer
-- `timezoneOffset`, and backfill it offset-true.
--
-- WHY TWO PHASES: dropping `timezoneOffset` in the same release that introduces
-- `timezone` leaves no way back to the original values if the new column turns out
-- wrong in production, and the P3009 history from #23 makes a single destructive
-- step a bad bet. So this migration is additive only. The legacy column stays and
-- keeps being written (see `guildTimezoneUpdate()` in src/utils/timezoneHelper.ts);
-- a separate, later migration drops it once prod has been verified.
--
-- WHY Etc/GMT AND NOT NAMED ZONES: the old column is a bare integer. `+1` says
-- "UTC+1 all year" — it cannot distinguish a Berlin guild from a Lagos one, and
-- Berlin observes DST while Lagos does not. Mapping `+1 -> Europe/Berlin` would
-- silently move every existing +1 guild by an hour each summer. That is a semantic
-- change, not a lossless migration, so existing rows go to the fixed-offset
-- `Etc/GMT±X` zones, which reproduce the previous behaviour exactly and need no
-- action from anyone. Named DST-aware zones (Europe/Berlin, America/New_York, ...)
-- are for new guilds and for guilds that actively pick one via `/config timezone`.
--
-- MIND THE SIGN: POSIX inverts it. `Etc/GMT-1` is UTC+1 and `Etc/GMT+5` is UTC-5.
-- The CASE below therefore emits '-' for positive offsets. Covered by
-- src/utils/__tests__/timezoneHelper.test.ts, which resolves every generated zone
-- through Intl and asserts it lands back on the original offset.
--
-- RE-RUNNABLE: every statement is guarded. The column add is `IF NOT EXISTS`, the
-- backfill only touches rows still sitting on the default, and the legacy-column
-- read is wrapped in a `DO` block that no-ops once phase 2 has removed it. Running
-- this migration twice (or after a partially applied first attempt) is a no-op.

ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'UTC';

DO $$
BEGIN
  -- Phase 2 drops "timezoneOffset". Skip the backfill rather than fail if it is
  -- already gone, so this file stays replayable against a fully migrated database.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Guild' AND column_name = 'timezoneOffset'
  ) THEN
    RAISE NOTICE 'timezoneOffset already removed - skipping timezone backfill';
    RETURN;
  END IF;

  -- No CHECK constraint ever guarded this column, only application-level validation,
  -- so out-of-range values cannot be ruled out. There is no offset-true Etc/GMT zone
  -- outside -12..14, and quietly rewriting such a row to 'UTC' would be silent data
  -- loss. Abort instead: nothing has been written yet at this point, the operator can
  -- correct the offending rows, and re-running this migration then succeeds.
  IF EXISTS (
    SELECT 1 FROM "Guild" WHERE "timezoneOffset" < -12 OR "timezoneOffset" > 14
  ) THEN
    RAISE EXCEPTION
      'Guild.timezoneOffset outside the representable range -12..14; fix these rows before migrating: %',
      (SELECT string_agg(id || '=' || "timezoneOffset", ', ')
       FROM "Guild" WHERE "timezoneOffset" < -12 OR "timezoneOffset" > 14);
  END IF;

  -- Only rows still on the column default are touched. A guild that already has a
  -- zone (because the migration ran before, or because the app wrote one between
  -- attempts) keeps it. Offset 0 is already 'UTC', so it is excluded too — that also
  -- means an explicit UTC choice is never overwritten.
  UPDATE "Guild"
  SET "timezone" =
    'Etc/GMT' || CASE WHEN "timezoneOffset" > 0 THEN '-' ELSE '+' END || abs("timezoneOffset")
  WHERE "timezone" = 'UTC' AND "timezoneOffset" <> 0;
END $$;
