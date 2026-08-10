/**
 * Tests for IANA timezone handling (issue #37).
 *
 * Every expectation is an absolute UTC instant. That is deliberate: the bug being
 * fixed was that raid times were parsed with `new Date("YYYY-MM-DDTHH:MM:00")`,
 * which resolves in the *host process* timezone. These tests therefore also run
 * under a deliberately non-UTC process TZ (see the final describe block) to prove
 * the conversion no longer depends on it.
 */

import fs from 'fs';
import path from 'path';

import {
  addDaysInZone,
  nextWeeklyOccurrence,
  COMMON_TIMEZONES,
  DEFAULT_TIMEZONE,
  formatInTimezone,
  formatTimezoneLabel,
  getTimezoneOffsetMs,
  guildTimezoneUpdate,
  isValidTimezone,
  legacyOffsetToFixedZone,
  normalizeTimezone,
  searchTimezones,
  timezoneToLegacyOffset,
  zonedDateTimeToUtc,
} from '../timezoneHelper';

const HOUR = 60 * 60 * 1000;

describe('locale guessing is gone', () => {
  it('no longer exports a locale-based timezone guess', () => {
    // The old `getTimezoneFromLocale()` mapped Discord's *language* setting to an
    // offset, which reported GMT-5 for a German server running an English UI.
    const helper = require('../timezoneHelper');
    expect(helper.getTimezoneFromLocale).toBeUndefined();
    expect(helper.LOCALE_TO_TIMEZONE).toBeUndefined();
  });

  it('defaults to UTC rather than a guess', () => {
    expect(DEFAULT_TIMEZONE).toBe('UTC');
  });
});

describe('isValidTimezone()', () => {
  it.each(['UTC', 'Europe/Berlin', 'America/New_York', 'Etc/GMT+3', 'Pacific/Auckland'])(
    'accepts %s',
    (zone) => {
      expect(isValidTimezone(zone)).toBe(true);
    }
  );

  // ES2022 offset identifiers such as '+01:00' are runtime-dependent: Node 20+ accepts
  // them, Node 18 (what the Docker image and CI run) throws RangeError. isValidTimezone
  // deliberately delegates that judgement to Intl rather than second-guessing it, so the
  // contract under test is "agrees with Intl", not a fixed verdict. Either answer is
  // correct — an offset identifier is a real zone without DST rules, and rejecting it on
  // older runtimes only turns away an exotic input format nothing in the bot emits.
  it('agrees with Intl on ES2022 offset identifiers', () => {
    let intlAccepts = true;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: '+01:00' });
    } catch {
      intlAccepts = false;
    }
    expect(isValidTimezone('+01:00')).toBe(intlAccepts);
  });

  it.each([
    ['an invented zone', 'Mordor/Barad-dur'],
    ['a legacy integer offset', '2'],
    ['an abbreviation', 'CEST'],
    ['empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_label, value) => {
    expect(isValidTimezone(value as string)).toBe(false);
  });
});

describe('normalizeTimezone()', () => {
  it('canonicalizes casing and trims whitespace', () => {
    expect(normalizeTimezone('  europe/berlin ')).toBe('Europe/Berlin');
    expect(normalizeTimezone('AMERICA/NEW_YORK')).toBe('America/New_York');
  });

  it('passes through valid zones outside the curated list', () => {
    expect(normalizeTimezone('Asia/Kathmandu')).toBe('Asia/Kathmandu');
  });

  it('returns null for anything the runtime does not recognise', () => {
    expect(normalizeTimezone('Not/AZone')).toBeNull();
    expect(normalizeTimezone('   ')).toBeNull();
    expect(normalizeTimezone(null)).toBeNull();
  });
});

describe('getTimezoneOffsetMs()', () => {
  it('reports the winter offset for Europe/Berlin', () => {
    expect(getTimezoneOffsetMs(new Date('2026-01-15T12:00:00Z'), 'Europe/Berlin')).toBe(1 * HOUR);
  });

  it('reports the summer offset for Europe/Berlin', () => {
    expect(getTimezoneOffsetMs(new Date('2026-07-15T12:00:00Z'), 'Europe/Berlin')).toBe(2 * HOUR);
  });

  it('reports negative offsets west of Greenwich', () => {
    expect(getTimezoneOffsetMs(new Date('2026-01-15T12:00:00Z'), 'America/New_York')).toBe(-5 * HOUR);
    expect(getTimezoneOffsetMs(new Date('2026-07-15T12:00:00Z'), 'America/New_York')).toBe(-4 * HOUR);
  });

  it('handles sub-hour offsets', () => {
    expect(getTimezoneOffsetMs(new Date('2026-01-15T12:00:00Z'), 'Asia/Kolkata')).toBe(5.5 * HOUR);
  });

  it('is zero for UTC', () => {
    expect(getTimezoneOffsetMs(new Date('2026-07-15T12:00:00Z'), 'UTC')).toBe(0);
  });
});

describe('zonedDateTimeToUtc()', () => {
  it('interprets a wall-clock time in the given zone', () => {
    expect(zonedDateTimeToUtc('2026-01-15', '20:00', 'Europe/Berlin')!.toISOString()).toBe(
      '2026-01-15T19:00:00.000Z'
    );
  });

  it('is an identity mapping for UTC', () => {
    expect(zonedDateTimeToUtc('2026-01-15', '20:00', 'UTC')!.toISOString()).toBe(
      '2026-01-15T20:00:00.000Z'
    );
  });

  it('shifts forward for zones west of Greenwich, crossing the date line where needed', () => {
    expect(zonedDateTimeToUtc('2026-01-15', '20:00', 'America/New_York')!.toISOString()).toBe(
      '2026-01-16T01:00:00.000Z'
    );
  });

  // The core acceptance criterion from issue #37: same typed time, different season.
  describe('daylight saving', () => {
    it('keeps 20:00 local meaning 20:00 local in both January and July', () => {
      const winter = zonedDateTimeToUtc('2026-01-15', '20:00', 'Europe/Berlin')!;
      const summer = zonedDateTimeToUtc('2026-07-15', '20:00', 'Europe/Berlin')!;

      expect(formatInTimezone(winter, 'Europe/Berlin').time).toBe('20:00');
      expect(formatInTimezone(summer, 'Europe/Berlin').time).toBe('20:00');

      // ...and they are genuinely different UTC offsets, so this is not a no-op.
      expect(winter.toISOString()).toBe('2026-01-15T19:00:00.000Z');
      expect(summer.toISOString()).toBe('2026-07-15T18:00:00.000Z');
    });

    it('applies the correct offset on either side of the March transition', () => {
      // Europe/Berlin springs forward at 02:00 local on Sun 2026-03-29.
      expect(zonedDateTimeToUtc('2026-03-28', '20:00', 'Europe/Berlin')!.toISOString()).toBe(
        '2026-03-28T19:00:00.000Z' // still CET (+1)
      );
      expect(zonedDateTimeToUtc('2026-03-29', '20:00', 'Europe/Berlin')!.toISOString()).toBe(
        '2026-03-29T18:00:00.000Z' // now CEST (+2)
      );
    });

    it('applies the correct offset on either side of the October transition', () => {
      // Europe/Berlin falls back at 03:00 local on Sun 2026-10-25.
      expect(zonedDateTimeToUtc('2026-10-24', '20:00', 'Europe/Berlin')!.toISOString()).toBe(
        '2026-10-24T18:00:00.000Z' // still CEST (+2)
      );
      expect(zonedDateTimeToUtc('2026-10-25', '20:00', 'Europe/Berlin')!.toISOString()).toBe(
        '2026-10-25T19:00:00.000Z' // back to CET (+1)
      );
    });

    it('resolves a nonexistent spring-forward local time to the instant after the jump', () => {
      // 02:30 on 2026-03-29 never happens in Berlin: 02:00 becomes 03:00.
      const result = zonedDateTimeToUtc('2026-03-29', '02:30', 'Europe/Berlin')!;

      expect(result).not.toBeNull();
      expect(result.toISOString()).toBe('2026-03-29T01:30:00.000Z');
      // Which is 03:30 local — pushed past the gap rather than silently wrong by an hour.
      expect(formatInTimezone(result, 'Europe/Berlin').time).toBe('03:30');
    });

    it('resolves an ambiguous autumn-fallback local time to the standard-time occurrence', () => {
      // 02:30 on 2026-10-25 happens twice in Berlin: once at +2 (CEST, 00:30Z) and
      // again at +1 (CET, 01:30Z). Either is defensible; what matters is that the
      // choice is deterministic and lands on a real 02:30 local.
      const result = zonedDateTimeToUtc('2026-10-25', '02:30', 'Europe/Berlin')!;

      expect(result.toISOString()).toBe('2026-10-25T01:30:00.000Z'); // the CET one
      expect(formatInTimezone(result, 'Europe/Berlin').time).toBe('02:30');
    });

    it('handles southern-hemisphere DST, where the seasons are inverted', () => {
      // Sydney is UTC+11 in January (AEDT) and UTC+10 in July (AEST).
      expect(zonedDateTimeToUtc('2026-01-15', '20:00', 'Australia/Sydney')!.toISOString()).toBe(
        '2026-01-15T09:00:00.000Z'
      );
      expect(zonedDateTimeToUtc('2026-07-15', '20:00', 'Australia/Sydney')!.toISOString()).toBe(
        '2026-07-15T10:00:00.000Z'
      );
    });

    it('leaves zones without DST unchanged across seasons', () => {
      expect(zonedDateTimeToUtc('2026-01-15', '20:00', 'Asia/Tokyo')!.toISOString()).toBe(
        '2026-01-15T11:00:00.000Z'
      );
      expect(zonedDateTimeToUtc('2026-07-15', '20:00', 'Asia/Tokyo')!.toISOString()).toBe(
        '2026-07-15T11:00:00.000Z'
      );
    });
  });

  describe('input validation', () => {
    it.each([
      ['a malformed date', '15-01-2026', '20:00'],
      ['a missing zero pad', '2026-1-15', '20:00'],
      ['a malformed time', '2026-01-15', '8pm'],
      ['an out-of-range hour', '2026-01-15', '25:00'],
      ['an out-of-range minute', '2026-01-15', '20:75'],
      ['an out-of-range month', '2026-13-01', '20:00'],
      ['a day that does not exist', '2026-02-30', '20:00'],
      ['an empty date', '', '20:00'],
    ])('returns null for %s', (_label, date, time) => {
      expect(zonedDateTimeToUtc(date, time, 'Europe/Berlin')).toBeNull();
    });

    it('accepts a leap day in a leap year and rejects it otherwise', () => {
      expect(zonedDateTimeToUtc('2028-02-29', '20:00', 'UTC')).not.toBeNull();
      expect(zonedDateTimeToUtc('2026-02-29', '20:00', 'UTC')).toBeNull();
    });

    it('returns null for an unknown zone instead of silently defaulting', () => {
      expect(zonedDateTimeToUtc('2026-01-15', '20:00', 'Mordor/Barad-dur')).toBeNull();
    });

    it('tolerates surrounding whitespace and a single-digit hour', () => {
      expect(zonedDateTimeToUtc(' 2026-01-15 ', ' 9:05 ', 'UTC')!.toISOString()).toBe(
        '2026-01-15T09:05:00.000Z'
      );
    });
  });
});

describe('formatInTimezone()', () => {
  it('renders the wall-clock pair seen in the zone', () => {
    expect(formatInTimezone(new Date('2026-07-15T18:00:00Z'), 'Europe/Berlin')).toEqual({
      date: '2026-07-15',
      time: '20:00',
    });
  });

  it('rolls the date backwards for zones west of Greenwich', () => {
    expect(formatInTimezone(new Date('2026-01-16T01:00:00Z'), 'America/New_York')).toEqual({
      date: '2026-01-15',
      time: '20:00',
    });
  });

  it('renders midnight as 00:00 rather than 24:00', () => {
    expect(formatInTimezone(new Date('2026-01-15T00:00:00Z'), 'UTC').time).toBe('00:00');
  });

  it('round-trips with zonedDateTimeToUtc', () => {
    const zone = 'America/Los_Angeles';
    const instant = zonedDateTimeToUtc('2026-09-04', '19:30', zone)!;
    expect(formatInTimezone(instant, zone)).toEqual({ date: '2026-09-04', time: '19:30' });
  });

  it('falls back to UTC for an unusable zone instead of throwing', () => {
    expect(formatInTimezone(new Date('2026-01-15T12:00:00Z'), 'Not/AZone').time).toBe('12:00');
  });
});

describe('formatTimezoneLabel()', () => {
  it('shows the offset in effect at the given moment', () => {
    expect(formatTimezoneLabel('Europe/Berlin', new Date('2026-01-15T12:00:00Z'))).toBe(
      'Europe/Berlin (GMT+1)'
    );
    expect(formatTimezoneLabel('Europe/Berlin', new Date('2026-07-15T12:00:00Z'))).toBe(
      'Europe/Berlin (GMT+2)'
    );
  });

  it('formats negative offsets', () => {
    expect(formatTimezoneLabel('America/New_York', new Date('2026-01-15T12:00:00Z'))).toBe(
      'America/New_York (GMT-5)'
    );
  });

  it('formats sub-hour offsets', () => {
    expect(formatTimezoneLabel('Asia/Kolkata', new Date('2026-01-15T12:00:00Z'))).toBe(
      'Asia/Kolkata (GMT+5:30)'
    );
  });

  it('labels UTC without a sign quirk', () => {
    expect(formatTimezoneLabel('UTC', new Date('2026-01-15T12:00:00Z'))).toBe('UTC (GMT+0)');
  });

  it('returns the input unchanged for an unknown zone', () => {
    expect(formatTimezoneLabel('Not/AZone')).toBe('Not/AZone');
  });

  it('stays within Discord\'s 100-character autocomplete label limit for every offered zone', () => {
    for (const zone of COMMON_TIMEZONES) {
      expect(formatTimezoneLabel(zone).length).toBeLessThanOrEqual(100);
    }
  });
});

describe('searchTimezones()', () => {
  it('returns at most 25 results, Discord\'s autocomplete limit', () => {
    expect(searchTimezones('').length).toBeLessThanOrEqual(25);
    expect(searchTimezones('a').length).toBeLessThanOrEqual(25);
  });

  it('offers UTC first when nothing has been typed', () => {
    expect(searchTimezones('')[0]).toBe('UTC');
  });

  it('matches on the city segment, not just the full identifier', () => {
    expect(searchTimezones('berlin')).toContain('Europe/Berlin');
    expect(searchTimezones('new_york')).toContain('America/New_York');
  });

  it('treats a typed space like the underscore in the identifier', () => {
    expect(searchTimezones('new york')).toContain('America/New_York');
  });

  it('is case-insensitive', () => {
    expect(searchTimezones('BERLIN')).toContain('Europe/Berlin');
  });

  it('matches on the region prefix', () => {
    const results = searchTimezones('europe/');
    expect(results.length).toBeGreaterThan(1);
    expect(results.every((zone) => zone.startsWith('Europe/'))).toBe(true);
  });

  it('ranks prefix matches ahead of substring matches', () => {
    const results = searchTimezones('dublin');
    expect(results[0]).toBe('Europe/Dublin');
  });

  it('returns an empty list rather than throwing when nothing matches', () => {
    expect(searchTimezones('zzzznope')).toEqual([]);
  });

  it('only offers zones the runtime can actually resolve', () => {
    for (const zone of COMMON_TIMEZONES) {
      expect(isValidTimezone(zone)).toBe(true);
    }
  });
});

describe('offset-true migration of legacy integer offsets', () => {
  // The whole point of the phase-1 backfill: an existing guild must keep the exact
  // offset it had. Etc/GMT zones never observe DST, so the same offset has to come
  // back out in January and in July.
  const OFFSETS = Array.from({ length: 27 }, (_, i) => i - 12); // -12..14
  const WINTER = new Date('2026-01-15T12:00:00Z');
  const SUMMER = new Date('2026-07-15T12:00:00Z');

  it.each(OFFSETS)('maps offset %d to a zone with exactly that offset, all year', (offset) => {
    const zone = legacyOffsetToFixedZone(offset)!;
    expect(zone).not.toBeNull();
    expect(isValidTimezone(zone)).toBe(true);
    expect(getTimezoneOffsetMs(WINTER, zone)).toBe(offset * HOUR);
    expect(getTimezoneOffsetMs(SUMMER, zone)).toBe(offset * HOUR);
  });

  // POSIX inverts the sign inside Etc/GMT names. Getting this backwards would move
  // every migrated guild by twice its offset, so it is asserted literally.
  it('inverts the sign the way POSIX does, not the way it reads', () => {
    expect(legacyOffsetToFixedZone(1)).toBe('Etc/GMT-1');
    expect(legacyOffsetToFixedZone(10)).toBe('Etc/GMT-10');
    expect(legacyOffsetToFixedZone(-5)).toBe('Etc/GMT+5');
    expect(legacyOffsetToFixedZone(-12)).toBe('Etc/GMT+12');
  });

  it('reads Etc/GMT-1 as UTC+1 and Etc/GMT+5 as UTC-5', () => {
    // 20:00 in a UTC+1 guild is 19:00 UTC — in summer too, unlike Europe/Berlin.
    expect(zonedDateTimeToUtc('2026-07-15', '20:00', 'Etc/GMT-1')!.toISOString()).toBe(
      '2026-07-15T19:00:00.000Z'
    );
    // 20:00 in a UTC-5 guild is 01:00 UTC the next day — unlike America/New_York,
    // which would be 00:00 in July.
    expect(zonedDateTimeToUtc('2026-07-15', '20:00', 'Etc/GMT+5')!.toISOString()).toBe(
      '2026-07-16T01:00:00.000Z'
    );
  });

  it('keeps offset 0 on UTC', () => {
    expect(legacyOffsetToFixedZone(0)).toBe('UTC');
  });

  it('refuses offsets no Etc/GMT zone can express', () => {
    // The migration aborts on these rather than silently rewriting them to UTC.
    expect(legacyOffsetToFixedZone(-13)).toBeNull();
    expect(legacyOffsetToFixedZone(15)).toBeNull();
    expect(legacyOffsetToFixedZone(1.5)).toBeNull();
  });

  it('round-trips a legacy offset through the fixed zone and back', () => {
    for (const offset of OFFSETS) {
      const zone = legacyOffsetToFixedZone(offset)!;
      expect(timezoneToLegacyOffset(zone, SUMMER)).toBe(offset);
      expect(timezoneToLegacyOffset(zone, WINTER)).toBe(offset);
    }
  });
});

describe('dual-write of the deprecated timezoneOffset column', () => {
  it('writes both columns from one call', () => {
    expect(guildTimezoneUpdate('Etc/GMT-1', new Date('2026-07-15T12:00:00Z'))).toEqual({
      timezone: 'Etc/GMT-1',
      timezoneOffset: 1,
    });
  });

  it('records the offset in effect at the given moment for a DST zone', () => {
    expect(guildTimezoneUpdate('Europe/Berlin', new Date('2026-01-15T12:00:00Z')).timezoneOffset).toBe(1);
    expect(guildTimezoneUpdate('Europe/Berlin', new Date('2026-07-15T12:00:00Z')).timezoneOffset).toBe(2);
  });

  it('truncates sub-hour zones toward zero rather than throwing', () => {
    // Asia/Kolkata is +5:30 and Pacific/Marquesas is -9:30 — the integer column
    // cannot hold either, which is exactly why nothing reads it any more.
    expect(timezoneToLegacyOffset('Asia/Kolkata', new Date('2026-07-15T12:00:00Z'))).toBe(5);
    expect(timezoneToLegacyOffset('Pacific/Marquesas', new Date('2026-07-15T12:00:00Z'))).toBe(-9);
  });

  it('falls back to 0 for a zone the runtime cannot resolve', () => {
    expect(timezoneToLegacyOffset('Not/AZone')).toBe(0);
  });
});

describe('phase-1 migration is additive and re-runnable', () => {
  // These assertions guard the review outcome on PR #40: the migration must not drop
  // the legacy column, and must survive a partial or repeated run.
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      '../../../prisma/migrations/20260803090000_guild_timezone_iana_phase1/migration.sql'
    ),
    'utf8'
  );

  it('does not drop the legacy column in this phase', () => {
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
  });

  it('adds the new column idempotently', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "timezone"/i);
  });

  it('only backfills rows still on the default, so a re-run cannot clobber a set zone', () => {
    expect(sql).toMatch(/WHERE "timezone" = 'UTC' AND "timezoneOffset" <> 0/);
  });

  it('maps to fixed-offset zones, never to a named DST zone', () => {
    expect(sql).toMatch(/'Etc\/GMT'/);
    expect(sql).not.toMatch(/Europe\/Berlin'|America\/New_York'|Australia\/Brisbane'/);
  });

  it('emits the POSIX sign inversion (positive offset produces a minus)', () => {
    expect(sql).toMatch(/CASE WHEN "timezoneOffset" > 0 THEN '-' ELSE '\+' END/);
  });

  it('fails loudly on out-of-range offsets instead of defaulting them to UTC', () => {
    expect(sql).toMatch(/RAISE EXCEPTION/);
    expect(sql).not.toMatch(/ELSE 'UTC'/);
  });
});

describe('independence from the host process timezone', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  // The old implementation only produced correct instants when the container ran on
  // UTC — an unspoken deployment dependency. Pinning the process to a wildly
  // different zone must not move the result.
  it.each(['UTC', 'America/Anchorage', 'Pacific/Kiritimati', 'Asia/Kolkata'])(
    'produces the same instant with TZ=%s',
    (hostTz) => {
      process.env.TZ = hostTz;
      expect(zonedDateTimeToUtc('2026-07-15', '20:00', 'Europe/Berlin')!.toISOString()).toBe(
        '2026-07-15T18:00:00.000Z'
      );
    }
  );
});

/**
 * Weekly recurrence arithmetic.
 *
 * The bug these guard against is the obvious implementation: `raidDate + 604_800_000`.
 * That is a *duration*, and a week measured in milliseconds is one hour wrong on either
 * side of a DST switch — a 20:00 raid silently becomes 19:00 or 21:00 for its players.
 */
describe('addDaysInZone / nextWeeklyOccurrence across DST', () => {
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

  it('keeps the local time when the clocks go back (Europe/Berlin, autumn)', () => {
    // 2026-10-22 20:00 Berlin is CEST (UTC+2). One week later Berlin is on CET (UTC+1),
    // so the same wall-clock slot is a different instant — one hour later in UTC.
    const source = new Date('2026-10-22T18:00:00.000Z');

    const next = addDaysInZone(source, 'Europe/Berlin', 7)!;

    expect(next.toISOString()).toBe('2026-10-29T19:00:00.000Z');
    expect(formatInTimezone(next, 'Europe/Berlin')).toEqual({ date: '2026-10-29', time: '20:00' });
    // Explicitly not a fixed-duration week.
    expect(next.getTime() - source.getTime()).not.toBe(MS_PER_WEEK);
  });

  it('keeps the local time when the clocks go forward (Europe/Berlin, spring)', () => {
    // 2026-03-25 20:00 Berlin is CET (UTC+1); a week later it is CEST (UTC+2).
    const source = new Date('2026-03-25T19:00:00.000Z');

    const next = addDaysInZone(source, 'Europe/Berlin', 7)!;

    expect(next.toISOString()).toBe('2026-04-01T18:00:00.000Z');
    expect(formatInTimezone(next, 'Europe/Berlin')).toEqual({ date: '2026-04-01', time: '20:00' });
  });

  it('keeps the local time across a US transition too', () => {
    // 2026-10-31 20:00 New York is EDT (UTC-4); a week later it is EST (UTC-5).
    const source = new Date('2026-11-01T00:00:00.000Z');

    const next = addDaysInZone(source, 'America/New_York', 7)!;

    expect(formatInTimezone(next, 'America/New_York')).toEqual({ date: '2026-11-07', time: '20:00' });
  });

  it('is a plain week in a zone without DST', () => {
    const source = new Date('2026-10-22T18:00:00.000Z');
    const next = addDaysInZone(source, 'UTC', 7)!;
    expect(next.getTime() - source.getTime()).toBe(MS_PER_WEEK);
  });

  it('falls back to UTC for an unknown zone rather than returning null', () => {
    const next = addDaysInZone(new Date('2026-07-15T18:00:00.000Z'), 'Middle/Earth', 7)!;
    expect(next.toISOString()).toBe('2026-07-22T18:00:00.000Z');
  });

  it('nextWeeklyOccurrence returns the following week for a raid that just ended', () => {
    const source = new Date('2026-10-22T18:00:00.000Z');
    const next = nextWeeklyOccurrence(source, 'Europe/Berlin', new Date('2026-10-22T22:00:00.000Z'))!;
    expect(next.toISOString()).toBe('2026-10-29T19:00:00.000Z');
  });

  it('nextWeeklyOccurrence skips forward past a long pause instead of scheduling in the past', () => {
    // Series paused for a month; the resumed raid must still be in the future and still
    // land on the same weekday at the same local time.
    const source = new Date('2026-10-22T18:00:00.000Z');
    const now = new Date('2026-11-18T12:00:00.000Z');

    const next = nextWeeklyOccurrence(source, 'Europe/Berlin', now)!;

    expect(next > now).toBe(true);
    expect(formatInTimezone(next, 'Europe/Berlin')).toEqual({ date: '2026-11-19', time: '20:00' });
  });
});
