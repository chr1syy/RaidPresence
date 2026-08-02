-- Replace the fixed integer UTC offset with an IANA timezone identifier.
--
-- The old `timezoneOffset` could not express daylight saving time: a German guild
-- correctly set to +1 in winter ran an hour off for the whole summer. IANA zones
-- carry their own DST rules, so `Intl.DateTimeFormat` resolves the right offset
-- for whichever date a raid is scheduled on.
--
-- Existing guilds are migrated in place and need no action. Each offset maps to the
-- most plausible populated zone for that offset; offsets with no obvious population
-- centre fall back to a fixed-offset `Etc/GMT±X` zone, which reproduces the previous
-- behaviour exactly.
--
-- Two deliberate choices worth naming:
--   * Offset 0 maps to 'UTC', not 'Europe/London'. 0 is also the column default, so
--     an unconfigured guild is indistinguishable from a deliberately-UTC one. UTC
--     preserves today's behaviour for both; UK guilds can pick Europe/London.
--   * Offsets for DST-observing regions (e.g. +1 -> Europe/Berlin, -5 ->
--     America/New_York) will now shift by an hour in summer. That is the bug being
--     fixed, not a regression: those guilds previously scheduled raids an hour off
--     for half the year.
--
-- Note the POSIX sign inversion in `Etc/GMT±X`: Etc/GMT+3 is UTC-3.

ALTER TABLE "Guild" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';

UPDATE "Guild" SET "timezone" = CASE "timezoneOffset"
  WHEN -12 THEN 'Etc/GMT+12'
  WHEN -11 THEN 'Pacific/Pago_Pago'
  WHEN -10 THEN 'Pacific/Honolulu'
  WHEN  -9 THEN 'America/Anchorage'
  WHEN  -8 THEN 'America/Los_Angeles'
  WHEN  -7 THEN 'America/Denver'
  WHEN  -6 THEN 'America/Chicago'
  WHEN  -5 THEN 'America/New_York'
  WHEN  -4 THEN 'America/Halifax'
  WHEN  -3 THEN 'America/Sao_Paulo'
  WHEN  -2 THEN 'Etc/GMT+2'
  WHEN  -1 THEN 'Atlantic/Azores'
  WHEN   0 THEN 'UTC'
  WHEN   1 THEN 'Europe/Berlin'
  WHEN   2 THEN 'Europe/Helsinki'
  WHEN   3 THEN 'Europe/Moscow'
  WHEN   4 THEN 'Asia/Dubai'
  WHEN   5 THEN 'Asia/Karachi'
  WHEN   6 THEN 'Asia/Dhaka'
  WHEN   7 THEN 'Asia/Bangkok'
  WHEN   8 THEN 'Asia/Shanghai'
  WHEN   9 THEN 'Asia/Tokyo'
  WHEN  10 THEN 'Australia/Brisbane'
  WHEN  11 THEN 'Pacific/Guadalcanal'
  WHEN  12 THEN 'Pacific/Auckland'
  WHEN  13 THEN 'Pacific/Apia'
  WHEN  14 THEN 'Pacific/Kiritimati'
  ELSE 'UTC'
END;

ALTER TABLE "Guild" DROP COLUMN "timezoneOffset";
