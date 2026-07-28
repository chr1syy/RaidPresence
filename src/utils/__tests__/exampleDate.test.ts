/**
 * Regression test suite for the runtime-generated example date.
 *
 * Background: the welcome embed and `/setup` used to ship a hardcoded
 * `2026-01-15` sample. `/raid create` rejects past dates, so that sample turned
 * into a guaranteed error for every new server once the date had passed. These
 * tests pin both the formatting contract and the "always in the future"
 * property that caused the outage.
 */

import { exampleRaidDate } from '../exampleDate';

describe('exampleRaidDate()', () => {
  it('adds the requested number of days to the injected reference date', () => {
    expect(exampleRaidDate(7, new Date('2026-07-28T12:00:00Z'))).toBe('2026-08-04');
  });

  it('zero-pads single-digit months and days', () => {
    expect(exampleRaidDate(5, new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-06');
  });

  it('rolls over month boundaries', () => {
    expect(exampleRaidDate(7, new Date('2026-03-28T09:30:00Z'))).toBe('2026-04-04');
  });

  it('rolls over year boundaries', () => {
    expect(exampleRaidDate(7, new Date('2026-12-28T00:00:00Z'))).toBe('2027-01-04');
  });

  it('handles leap days', () => {
    expect(exampleRaidDate(1, new Date('2028-02-28T00:00:00Z'))).toBe('2028-02-29');
  });

  it('defaults to seven days ahead', () => {
    const now = new Date('2026-07-28T12:00:00Z');
    expect(exampleRaidDate(undefined, now)).toBe(exampleRaidDate(7, now));
  });

  it('always returns a date in the future when called with defaults', () => {
    // This is the actual regression guard: it fails the moment somebody
    // reintroduces a static date, because /raid create rejects past dates.
    const rendered = exampleRaidDate();

    expect(rendered).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${rendered}T00:00:00Z`).getTime()).toBeGreaterThan(Date.now());
  });

  it('is not the retired hardcoded sample date', () => {
    expect(exampleRaidDate()).not.toBe('2026-01-15');
  });

  it('is independent of the host timezone (built from UTC components)', () => {
    // A local-time implementation would drift by a day for hosts west of UTC.
    expect(exampleRaidDate(7, new Date('2026-07-28T23:59:59Z'))).toBe('2026-08-04');
    expect(exampleRaidDate(7, new Date('2026-07-28T00:00:00Z'))).toBe('2026-08-04');
  });
});
