/**
 * IANA timezone handling for raid scheduling.
 *
 * The bot deliberately does NOT try to detect a guild's timezone. Discord exposes
 * `guild.preferredLocale`, which is a *language* setting, not a location — guessing
 * a zone from it produced confidently wrong results (an English-language German
 * server was scheduled as US Eastern). Default is UTC until a raid leader sets a
 * zone explicitly via `/config timezone`.
 *
 * Display is not the problem this module solves: every user-facing timestamp is a
 * Discord `<t:unix:F>` tag, which each viewer's client renders in their own local
 * time. The guild zone is needed at exactly one point — interpreting the wall-clock
 * time a raid leader types ("20:00") as an instant.
 */

/** Zones offered by `/config timezone` autocomplete, roughly ordered by expected use. */
export const COMMON_TIMEZONES: readonly string[] = [
  'UTC',
  'Europe/Berlin',
  'Europe/Vienna',
  'Europe/Zurich',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Copenhagen',
  'Europe/Oslo',
  'Europe/Stockholm',
  'Europe/Helsinki',
  'Europe/Warsaw',
  'Europe/Prague',
  'Europe/Budapest',
  'Europe/Bucharest',
  'Europe/Athens',
  'Europe/Lisbon',
  'Europe/Kyiv',
  'Europe/Moscow',
  'Europe/Istanbul',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'America/Mexico_City',
  'America/Bogota',
  'America/Argentina/Buenos_Aires',
  'Asia/Jerusalem',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Perth',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
];

/** Default zone for guilds that have never configured one. */
export const DEFAULT_TIMEZONE = 'UTC';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

/**
 * Checks whether a string is a timezone identifier the runtime's ICU data knows.
 *
 * Accepts anything `Intl` accepts — so real IANA names beyond COMMON_TIMEZONES
 * (and fixed-offset `Etc/GMT+X` zones) work too. `Intl.DateTimeFormat` throws a
 * RangeError for unknown identifiers, which is the only reliable way to ask.
 */
export function isValidTimezone(timeZone: string | null | undefined): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes user input to the canonical casing used by COMMON_TIMEZONES.
 *
 * Discord autocomplete lets users submit free text, and IANA identifiers are
 * case-sensitive in some runtimes. Returns null if the zone is not valid.
 */
export function normalizeTimezone(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const known = COMMON_TIMEZONES.find(
    (zone) => zone.toLowerCase() === trimmed.toLowerCase()
  );
  if (known) return known;

  return isValidTimezone(trimmed) ? trimmed : null;
}

/** Reads the wall-clock fields an instant has in `timeZone`. */
function getZonedParts(instant: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  // `en-CA` + 2-digit options gives stable, zero-padded numeric parts across runtimes.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const lookup: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      lookup[part.type] = parseInt(part.value, 10);
    }
  }

  return {
    year: lookup.year,
    month: lookup.month,
    day: lookup.day,
    hour: lookup.hour === 24 ? 0 : lookup.hour,
    minute: lookup.minute,
    second: lookup.second,
  };
}

/**
 * Returns the UTC offset of `timeZone` at `instant`, in milliseconds.
 *
 * Positive east of Greenwich (Europe/Berlin in summer → +7_200_000). Derived by
 * formatting the instant in the zone and re-reading those fields as if they were
 * UTC — the difference is the offset in effect at that moment, DST included.
 */
export function getTimezoneOffsetMs(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Strip sub-second precision from the instant so the difference is a clean offset.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Converts a wall-clock date/time in `timeZone` to the UTC instant it denotes.
 *
 * This replaces the old `new Date("YYYY-MM-DDTHH:MM:00")` + fixed-hour-shift
 * arithmetic, which parsed in the *host process* timezone and therefore only
 * worked when the container happened to run with TZ=UTC.
 *
 * Two passes are required: the offset itself depends on the instant, so the first
 * pass produces a candidate instant and the second re-reads the offset actually in
 * effect there. Around DST transitions:
 *   - Spring-forward gap (e.g. 02:30 on the last Sunday of March in Europe/Berlin
 *     does not exist): resolves to the corresponding instant after the jump.
 *   - Autumn-fallback overlap (02:30 happens twice): resolves to the second,
 *     standard-time occurrence.
 *
 * Returns null for malformed input, an unknown zone, or a calendar-invalid date
 * such as 2026-02-30.
 */
export function zonedDateTimeToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string
): Date | null {
  if (!isValidTimezone(timeZone)) return null;

  const dateMatch = DATE_PATTERN.exec((dateStr ?? '').trim());
  const timeMatch = TIME_PATTERN.exec((timeStr ?? '').trim());
  if (!dateMatch || !timeMatch) return null;

  const year = parseInt(dateMatch[1], 10);
  const month = parseInt(dateMatch[2], 10);
  const day = parseInt(dateMatch[3], 10);
  const hour = parseInt(timeMatch[1], 10);
  const minute = parseInt(timeMatch[2], 10);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;

  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

  // Date.UTC rolls overflow silently (Feb 30 → Mar 2); reject instead of guessing.
  const rolled = new Date(naiveUtc);
  if (
    rolled.getUTCFullYear() !== year ||
    rolled.getUTCMonth() !== month - 1 ||
    rolled.getUTCDate() !== day
  ) {
    return null;
  }

  const firstGuess = naiveUtc - getTimezoneOffsetMs(new Date(naiveUtc), timeZone);
  const offset = getTimezoneOffsetMs(new Date(firstGuess), timeZone);
  return new Date(naiveUtc - offset);
}

/**
 * Renders an instant as the `YYYY-MM-DD` / `HH:MM` wall-clock pair seen in `timeZone`.
 *
 * Used to pre-fill forms (raid clone/edit) with the time a raid leader originally
 * typed, rather than its UTC representation.
 */
export function formatInTimezone(
  instant: Date,
  timeZone: string
): { date: string; time: string } {
  const zone = isValidTimezone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  const p = getZonedParts(instant, zone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/**
 * Human-readable label for a zone, e.g. `Europe/Berlin (GMT+2)`.
 *
 * The offset is evaluated at `at` (default: now) because it changes with DST —
 * the label is a snapshot, not a property of the zone.
 */
export function formatTimezoneLabel(timeZone: string, at: Date = new Date()): string {
  if (!isValidTimezone(timeZone)) return timeZone;

  const offsetMinutes = getTimezoneOffsetMs(at, timeZone) / 60000;
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  const suffix = minutes === 0 ? `${hours}` : `${hours}:${String(minutes).padStart(2, '0')}`;

  return `${timeZone} (GMT${sign}${suffix})`;
}

/**
 * The fixed-offset zone that reproduces a legacy integer `timezoneOffset` exactly.
 *
 * Mirrors the backfill in `20260803090000_guild_timezone_iana_phase1/migration.sql`.
 * Note the POSIX sign inversion: `Etc/GMT-1` is UTC+1, so a positive offset produces
 * a minus sign. Offset 0 maps to 'UTC' rather than 'Etc/GMT+0' for readability — they
 * are the same instant either way.
 *
 * Returns null outside -12..14, which has no representable Etc/GMT zone. The migration
 * aborts on such rows for the same reason.
 */
export function legacyOffsetToFixedZone(offsetHours: number): string | null {
  if (!Number.isInteger(offsetHours) || offsetHours < -12 || offsetHours > 14) return null;
  if (offsetHours === 0) return DEFAULT_TIMEZONE;
  return `Etc/GMT${offsetHours > 0 ? '-' : '+'}${Math.abs(offsetHours)}`;
}

/**
 * The whole-hour UTC offset of `timeZone` at `at`, for the deprecated column only.
 *
 * Lossy by construction — a zone's offset changes with DST and some zones sit on a
 * half or quarter hour (Asia/Kolkata is +5:30). That is acceptable because nothing
 * reads the value: it exists so the legacy column stays roughly meaningful during the
 * two-phase rollout, and it disappears with the column in phase 2. Sub-hour offsets
 * truncate toward zero; the result is clamped into the range the column ever held.
 */
export function timezoneToLegacyOffset(timeZone: string, at: Date = new Date()): number {
  if (!isValidTimezone(timeZone)) return 0;
  const hours = Math.trunc(getTimezoneOffsetMs(at, timeZone) / 3_600_000);
  return Math.min(14, Math.max(-12, hours));
}

/**
 * Prisma payload for persisting a guild's timezone during the two-phase rollout.
 *
 * Every write site goes through this so the deprecated `timezoneOffset` column cannot
 * drift away from `timezone` while both exist. Phase 2 deletes this function and the
 * call sites collapse back to `{ timezone }`.
 */
export function guildTimezoneUpdate(
  timeZone: string,
  at: Date = new Date()
): { timezone: string; timezoneOffset: number } {
  return { timezone: timeZone, timezoneOffset: timezoneToLegacyOffset(timeZone, at) };
}

/**
 * Filters COMMON_TIMEZONES for a `/config timezone` autocomplete query.
 *
 * Matches on the identifier and on the city segment so "berlin" finds
 * `Europe/Berlin`. Capped at 25, Discord's hard limit for autocomplete choices.
 */
export function searchTimezones(query: string, limit = 25): string[] {
  const q = (query ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  const pool = COMMON_TIMEZONES;

  if (!q) return pool.slice(0, limit) as string[];

  const startsWith: string[] = [];
  const contains: string[] = [];

  for (const zone of pool) {
    const lower = zone.toLowerCase();
    const city = lower.split('/').pop() ?? '';
    if (lower.startsWith(q) || city.startsWith(q)) {
      startsWith.push(zone);
    } else if (lower.includes(q)) {
      contains.push(zone);
    }
  }

  return [...startsWith, ...contains].slice(0, limit);
}
