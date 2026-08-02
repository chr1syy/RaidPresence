/**
 * Tests for IANA timezone handling (issue #37).
 *
 * Every expectation is an absolute UTC instant. That is deliberate: the bug being
 * fixed was that raid times were parsed with `new Date("YYYY-MM-DDTHH:MM:00")`,
 * which resolves in the *host process* timezone. These tests therefore also run
 * under a deliberately non-UTC process TZ (see the final describe block) to prove
 * the conversion no longer depends on it.
 */

import {
  COMMON_TIMEZONES,
  DEFAULT_TIMEZONE,
  formatInTimezone,
  formatTimezoneLabel,
  getTimezoneOffsetMs,
  isValidTimezone,
  normalizeTimezone,
  searchTimezones,
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

  // Node's Intl also accepts ES2022 offset identifiers such as '+01:00'. That is
  // harmless — it is a real, unambiguous zone, just one without DST rules — so it is
  // deliberately not in the reject list below.
  it('accepts an ES2022 offset identifier', () => {
    expect(isValidTimezone('+01:00')).toBe(true);
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
