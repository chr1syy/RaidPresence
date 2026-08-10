/**
 * Scheduler passes added for recurring raids and the post-raid nudge.
 *
 * The behaviour under test is mostly the *query*: which raids each pass claims. That is
 * where idempotency lives — the series pass only sees raids whose successor slot is still
 * empty, so a rerun after a crash re-does exactly the work that was lost and nothing else.
 */

jest.mock('../../database/client', () => ({
  __esModule: true,
  default: { raid: { findMany: jest.fn() } },
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}));
jest.mock('../../commands/raid', () => ({ createRaidEmbed: jest.fn() }));
jest.mock('../archiveManager');
jest.mock('../teamContext', () => ({ getTeamLabel: jest.fn().mockResolvedValue(null) }));
jest.mock('../../services/recurringRaidService', () => ({
  advanceSeries: jest.fn().mockResolvedValue({ ok: true, raidId: 'raid-next', raidDate: new Date(), memberCount: 3 }),
  sendPostRaidNudge: jest.fn().mockResolvedValue(true),
  retireNudge: jest.fn().mockResolvedValue(undefined),
}));

import prisma from '../../database/client';
import {
  advanceSeries,
  retireNudge,
  sendPostRaidNudge,
} from '../../services/recurringRaidService';
import { NUDGE_LOOKBACK_MS, NUDGE_TTL_MS } from '../recurrence';
import { expireStaleNudges, processRecurringSeries, sendPostRaidNudges } from '../raidScheduler';

const client: any = { channels: { fetch: jest.fn() } };

describe('scheduler — recurring series pass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => jest.restoreAllMocks());

  it('only claims closed, active weekly raids whose successor slot is empty', async () => {
    await processRecurringSeries(client);

    const where = (prisma.raid.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.status).toBe('closed');
    expect(where.recurrenceRule).toBe('weekly');
    expect(where.recurrenceActive).toBe(true);
    // The idempotency clause: a raid that already produced next week is invisible here.
    expect(where.recurrenceChild).toEqual({ is: null });
    expect(where.raidDate.lt).toBeInstanceOf(Date);
  });

  it('advances every due series', async () => {
    (prisma.raid.findMany as jest.Mock).mockResolvedValue([{ id: 'raid-a' }, { id: 'raid-b' }]);

    await processRecurringSeries(client);

    expect(advanceSeries).toHaveBeenCalledTimes(2);
    expect(advanceSeries).toHaveBeenCalledWith(client, { id: 'raid-a' });
  });

  it('is a no-op on the next tick once the successor exists', async () => {
    // Same crash-recovery scenario, second run: the successor now satisfies the
    // `recurrenceChild` filter, so the query returns nothing and nothing is created twice.
    (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);

    await processRecurringSeries(client);

    expect(advanceSeries).not.toHaveBeenCalled();
  });

  it('keeps going when one series throws', async () => {
    (prisma.raid.findMany as jest.Mock).mockResolvedValue([{ id: 'raid-a' }, { id: 'raid-b' }]);
    (advanceSeries as jest.Mock)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ ok: true });

    await processRecurringSeries(client);

    expect(advanceSeries).toHaveBeenCalledTimes(2);
  });
});

describe('scheduler — post-raid nudge pass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => jest.restoreAllMocks());

  it('nudges only closed one-off raids that have not been nudged, within the lookback window', async () => {
    const before = Date.now();

    await sendPostRaidNudges(client);

    const where = (prisma.raid.findMany as jest.Mock).mock.calls[0][0].where;
    // Cancelled raids never reach this pass: only `status: 'closed'` is claimed.
    expect(where.status).toBe('closed');
    expect(where.nudgeSentAt).toBeNull();
    // A raid that is part of a series already produces next week — no nudge on top.
    expect(where.recurrenceRule).toBeNull();
    expect(where.recurrenceChild).toEqual({ is: null });
    // Bounded lookback so the first tick after deploy does not nudge the entire archive.
    const lookback = before - where.raidDate.gt.getTime();
    expect(lookback).toBeGreaterThanOrEqual(NUDGE_LOOKBACK_MS - 5_000);
    expect(lookback).toBeLessThanOrEqual(NUDGE_LOOKBACK_MS + 5_000);
  });

  it('sends one nudge per claimed raid', async () => {
    (prisma.raid.findMany as jest.Mock).mockResolvedValue([{ id: 'raid-a' }]);

    await sendPostRaidNudges(client);

    expect(sendPostRaidNudge).toHaveBeenCalledTimes(1);
    expect(sendPostRaidNudge).toHaveBeenCalledWith(client, { id: 'raid-a' });
  });
});

describe('scheduler — nudge expiry pass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => jest.restoreAllMocks());

  it('retires nudge buttons older than the TTL', async () => {
    const before = Date.now();
    (prisma.raid.findMany as jest.Mock).mockResolvedValue([{ id: 'raid-a', nudgeMessageId: 'm1' }]);

    await expireStaleNudges(client);

    const where = (prisma.raid.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.nudgeMessageId).toEqual({ not: null });
    const age = before - where.nudgeSentAt.lt.getTime();
    expect(age).toBeGreaterThanOrEqual(NUDGE_TTL_MS - 5_000);
    expect(retireNudge).toHaveBeenCalledWith(client, { id: 'raid-a', nudgeMessageId: 'm1' });
  });
});
