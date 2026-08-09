jest.mock('../database/client');

import prisma from '../database/client';
import {
  syncGuildOnJoin,
  markGuildDeparted,
  reconcileDepartedGuilds,
} from '../services/guildLifecycle';

const guildMock = (prisma as any).guild;

const NOW = new Date('2026-08-09T12:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
  guildMock.findUnique.mockResolvedValue(null);
  guildMock.upsert.mockResolvedValue({});
  guildMock.updateMany.mockResolvedValue({ count: 0 });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('markGuildDeparted', () => {
  it('stamps leftAt for a guildDelete event', async () => {
    guildMock.updateMany.mockResolvedValue({ count: 1 });

    await markGuildDeparted({ id: 'g1', name: 'Alpha' }, { now: NOW });

    expect(guildMock.updateMany).toHaveBeenCalledWith({
      where: { id: 'g1', leftAt: null },
      data: { leftAt: NOW },
    });
  });

  it('stamps even when the cached guild still carries a stale available === false', async () => {
    // discord.js only refreshes `available` when a payload carries `unavailable`, so a
    // guild that went through an outage keeps the flag until a full GUILD_CREATE. A kick
    // in that window still emits guildDelete — filtering on `available` would silently
    // drop it. Nothing in this module may read the flag; the extra property must not
    // change the outcome.
    guildMock.updateMany.mockResolvedValue({ count: 1 });

    await markGuildDeparted({ id: 'g1', name: 'Alpha', available: false } as any, { now: NOW });

    expect(guildMock.updateMany).toHaveBeenCalledWith({
      where: { id: 'g1', leftAt: null },
      data: { leftAt: NOW },
    });
  });

  it('never deletes the guild row or its related data', async () => {
    await markGuildDeparted({ id: 'g1', name: 'Alpha' }, { now: NOW });

    // Raids/teams/preferences cascade off the Guild row, so the row must survive.
    expect((prisma as any).raid.deleteMany).not.toHaveBeenCalled();
    expect((prisma as any).raid.delete).not.toHaveBeenCalled();
    expect(guildMock.upsert).not.toHaveBeenCalled();
  });

  it('leaves an already-recorded departure in place (duplicate event is a no-op)', async () => {
    // The `leftAt: null` predicate is what makes this safe — the DB matches nothing.
    guildMock.updateMany.mockResolvedValue({ count: 0 });

    await markGuildDeparted({ id: 'g1', name: 'Alpha' }, { now: NOW });

    expect(guildMock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ leftAt: null }) }),
    );
  });
});

describe('syncGuildOnJoin', () => {
  it('clears leftAt on the update branch so a returning guild counts as live', async () => {
    guildMock.findUnique.mockResolvedValue({ leftAt: new Date('2026-07-10T00:00:00.000Z') });

    await syncGuildOnJoin({ id: 'g1', name: 'Alpha' }, { now: NOW });

    expect(guildMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'g1' },
        update: { name: 'Alpha', leftAt: null },
      }),
    );
  });

  it('reports a row with a set leftAt as a re-install', async () => {
    const leftAt = new Date('2026-07-30T12:00:00.000Z');
    guildMock.findUnique.mockResolvedValue({ leftAt });

    const result = await syncGuildOnJoin({ id: 'g1', name: 'Alpha' }, { now: NOW });

    expect(result).toEqual({ rejoined: true, previousLeftAt: leftAt });
  });

  it('logs how long a re-installing guild was away', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    guildMock.findUnique.mockResolvedValue({ leftAt: new Date('2026-07-30T12:00:00.000Z') });

    await syncGuildOnJoin({ id: 'g1', name: 'Alpha' }, { now: NOW });

    expect(log).toHaveBeenCalledWith(expect.stringContaining('Re-install'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('10 day(s)'));
  });

  it('does not report a re-install for a guild that never left', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    guildMock.findUnique.mockResolvedValue({ leftAt: null });

    const result = await syncGuildOnJoin({ id: 'g1', name: 'Alpha' }, { now: NOW });

    expect(result).toEqual({ rejoined: false, previousLeftAt: null });
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Re-install'));
  });

  it('creates a fresh row for a first install without a leftAt value', async () => {
    guildMock.findUnique.mockResolvedValue(null);

    const result = await syncGuildOnJoin({ id: 'g2', name: 'Beta' }, { now: NOW });

    expect(result.rejoined).toBe(false);
    expect(guildMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ id: 'g2', name: 'Beta' }),
      }),
    );
    // A brand-new row is live by definition; leftAt stays at its NULL default.
    expect(guildMock.upsert.mock.calls[0][0].create).not.toHaveProperty('leftAt');
  });
});

describe('reconcileDepartedGuilds', () => {
  it('stamps only rows that are still live and not in the cache', async () => {
    guildMock.updateMany.mockResolvedValue({ count: 2 });

    const count = await reconcileDepartedGuilds(['g1', 'g2'], { now: NOW });

    expect(count).toBe(2);
    expect(guildMock.updateMany).toHaveBeenCalledWith({
      where: { leftAt: null, id: { notIn: ['g1', 'g2'] } },
      data: { leftAt: NOW },
    });
  });

  it('leaves already-stamped rows alone via the leftAt: null predicate', async () => {
    await reconcileDepartedGuilds(['g1'], { now: NOW });

    const where = guildMock.updateMany.mock.calls[0][0].where;
    expect(where.leftAt).toBeNull();
  });

  it('accepts an iterable such as the gateway cache keys', async () => {
    const cache = new Map([
      ['g1', {}],
      ['g2', {}],
    ]);

    await reconcileDepartedGuilds(cache.keys(), { now: NOW });

    expect(guildMock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { leftAt: null, id: { notIn: ['g1', 'g2'] } } }),
    );
  });

  it('writes nothing when the guild cache is empty', async () => {
    // `notIn: []` would match every row and wipe out the whole install base.
    const count = await reconcileDepartedGuilds([], { now: NOW });

    expect(count).toBe(0);
    expect(guildMock.updateMany).not.toHaveBeenCalled();
  });

  it('logs the number of departures it recorded', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    guildMock.updateMany.mockResolvedValue({ count: 68 });

    await reconcileDepartedGuilds(['g1'], { now: NOW });

    expect(log).toHaveBeenCalledWith('🚪 Reconciliation: 68 guild(s) marked as departed');
  });

  it('stays quiet when nothing changed', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    guildMock.updateMany.mockResolvedValue({ count: 0 });

    await reconcileDepartedGuilds(['g1'], { now: NOW });

    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Reconciliation'));
  });
});
