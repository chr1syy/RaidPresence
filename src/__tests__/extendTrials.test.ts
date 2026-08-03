/**
 * Tests for the one-off trial-extension script (TRIAL_DAYS 14 -> 30).
 *
 * The script rewrites production rows by hand, so the properties that matter are
 * safety ones: dry-run by default, a narrow target group, and idempotency.
 */
jest.mock('../database/client');

import prisma from '../database/client';
import { extendTrials } from '../scripts/extendTrials';
import { TRIAL_DAYS } from '../services/entitlementService';

const guildMock = (prisma as any).guild;

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-03T12:00:00Z');

/** A trial that started `daysAgo` days before NOW, still on the old 14-day expiry. */
function legacyTrial(id: string, daysAgo: number) {
  const trialStartedAt = new Date(NOW.getTime() - daysAgo * DAY_MS);
  return {
    id,
    name: `Guild ${id}`,
    trialStartedAt,
    premiumExpiresAt: new Date(trialStartedAt.getTime() + 14 * DAY_MS),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  guildMock.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('target group', () => {
  it('selects only real trials without a paid entitlement', async () => {
    guildMock.findMany.mockResolvedValue([]);

    await extendTrials({ now: NOW });

    expect(guildMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { trialStartedAt: { not: null }, entitlementId: null },
      }),
    );
  });

  it('never writes to a guild that has an entitlement', async () => {
    // The paying guild is excluded by the query itself, so the script only ever sees
    // trials. This asserts the predicate the database is given, which is the only
    // thing standing between the one paying guild and a rewritten expiry.
    guildMock.findMany.mockResolvedValue([]);

    await extendTrials({ dryRun: false, now: NOW });

    const where = guildMock.findMany.mock.calls[0][0].where;
    expect(where.entitlementId).toBeNull();
    expect(guildMock.updateMany).not.toHaveBeenCalled();
  });

  it('re-asserts the predicate on every write, in case a guild starts paying mid-run', async () => {
    guildMock.findMany.mockResolvedValue([legacyTrial('g1', 5)]);

    await extendTrials({ dryRun: false, now: NOW });

    expect(guildMock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'g1', trialStartedAt: { not: null }, entitlementId: null },
      }),
    );
  });
});

describe('dry run is the default', () => {
  it('writes nothing when called with no options', async () => {
    guildMock.findMany.mockResolvedValue([legacyTrial('g1', 5), legacyTrial('g2', 9)]);

    const result = await extendTrials({ now: NOW });

    expect(result.dryRun).toBe(true);
    expect(guildMock.updateMany).not.toHaveBeenCalled();
  });

  it('reports how many guilds are affected and how each expiry moves', async () => {
    const trial = legacyTrial('g1', 5);
    guildMock.findMany.mockResolvedValue([trial]);

    const result = await extendTrials({ now: NOW });

    expect(result.scanned).toBe(1);
    expect(result.changed).toBe(1);
    expect(result.plans[0].from).toEqual(trial.premiumExpiresAt);
    expect(result.plans[0].to).toEqual(
      new Date(trial.trialStartedAt.getTime() + TRIAL_DAYS * DAY_MS),
    );
  });

  it('writes only when dryRun is explicitly false', async () => {
    guildMock.findMany.mockResolvedValue([legacyTrial('g1', 5)]);

    const result = await extendTrials({ dryRun: false, now: NOW });

    expect(result.dryRun).toBe(false);
    expect(guildMock.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe('expiry maths', () => {
  it('extends a running trial to exactly trialStartedAt + TRIAL_DAYS', async () => {
    const trial = legacyTrial('g1', 6); // started 2026-07-28, expiring 2026-08-11
    guildMock.findMany.mockResolvedValue([trial]);

    await extendTrials({ dryRun: false, now: NOW });

    expect(guildMock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { premiumExpiresAt: new Date(trial.trialStartedAt.getTime() + 30 * DAY_MS) },
      }),
    );
  });

  it('computes from trialStartedAt, not from the current expiry', async () => {
    // Same start date, wildly different current expiry: the result must not move.
    const start = new Date('2026-07-20T10:00:00Z');
    guildMock.findMany.mockResolvedValue([
      { id: 'g1', name: 'A', trialStartedAt: start, premiumExpiresAt: new Date('2026-08-03T10:00:00Z') },
      { id: 'g2', name: 'B', trialStartedAt: start, premiumExpiresAt: new Date('2027-01-01T00:00:00Z') },
    ]);

    const result = await extendTrials({ now: NOW });

    const expected = new Date(start.getTime() + TRIAL_DAYS * DAY_MS);
    expect(result.plans.map((p) => p.to)).toEqual([expected, expected]);
  });

  it('handles a trial whose expiry was never stamped', async () => {
    const start = new Date('2026-07-20T10:00:00Z');
    guildMock.findMany.mockResolvedValue([
      { id: 'g1', name: 'A', trialStartedAt: start, premiumExpiresAt: null },
    ]);

    const result = await extendTrials({ now: NOW });

    expect(result.changed).toBe(1);
    expect(result.plans[0].from).toBeNull();
    expect(result.plans[0].alreadyExpired).toBe(false);
  });
});

describe('idempotency', () => {
  it('reports a guild already on the new expiry as unchanged and does not write it', async () => {
    const start = new Date('2026-07-20T10:00:00Z');
    guildMock.findMany.mockResolvedValue([
      {
        id: 'g1',
        name: 'A',
        trialStartedAt: start,
        premiumExpiresAt: new Date(start.getTime() + TRIAL_DAYS * DAY_MS),
      },
    ]);

    const result = await extendTrials({ dryRun: false, now: NOW });

    expect(result).toMatchObject({ scanned: 1, changed: 0, unchanged: 1 });
    expect(guildMock.updateMany).not.toHaveBeenCalled();
  });

  it('is a no-op on a second run against the rows the first run produced', async () => {
    const trial = legacyTrial('g1', 6);
    guildMock.findMany.mockResolvedValue([trial]);

    const first = await extendTrials({ dryRun: false, now: NOW });
    expect(first.changed).toBe(1);

    // Feed back what the first run wrote.
    guildMock.findMany.mockResolvedValue([
      { ...trial, premiumExpiresAt: first.plans[0].to },
    ]);
    guildMock.updateMany.mockClear();

    const second = await extendTrials({ dryRun: false, now: NOW });

    expect(second).toMatchObject({ changed: 0, unchanged: 1 });
    expect(guildMock.updateMany).not.toHaveBeenCalled();
  });
});

describe('already-expired trials', () => {
  it('revives a trial that expired but is still inside the new 30-day window', async () => {
    // Started 20 days ago: the 14-day expiry passed 6 days ago, the 30-day one is
    // 10 days out. This guild gets its remaining days back — that is the decision.
    const trial = legacyTrial('g1', 20);
    guildMock.findMany.mockResolvedValue([trial]);

    const result = await extendTrials({ now: NOW });

    expect(result.expired).toBe(1);
    expect(result.plans[0].alreadyExpired).toBe(true);
    expect(result.plans[0].to.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('does not resurrect a trial that started more than TRIAL_DAYS ago', async () => {
    // Started 60 days ago: recomputing lands 30 days in the past, so the guild stays
    // expired. Included in the count, harmless in effect.
    const trial = legacyTrial('g1', 60);
    guildMock.findMany.mockResolvedValue([trial]);

    const result = await extendTrials({ now: NOW });

    expect(result.plans[0].to.getTime()).toBeLessThan(NOW.getTime());
  });
});

describe('write failures', () => {
  it('warns instead of throwing when a row no longer matches at write time', async () => {
    guildMock.findMany.mockResolvedValue([legacyTrial('g1', 5)]);
    guildMock.updateMany.mockResolvedValue({ count: 0 });
    const warn = jest.spyOn(console, 'warn');

    await expect(extendTrials({ dryRun: false, now: NOW })).resolves.toBeDefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('g1'));
  });
});
