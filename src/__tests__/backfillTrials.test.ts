jest.mock('../database/client');

import prisma from '../database/client';
import { backfillTrials } from '../scripts/backfillTrials';
import { clearTierCache } from '../services/entitlementService';

const guildMock = (prisma as any).guild;

beforeEach(() => {
  jest.clearAllMocks();
  clearTierCache();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('backfillTrials', () => {
  it('selects only guilds that never had a trial, have no entitlement and are FREE', async () => {
    guildMock.findMany.mockResolvedValue([]);

    await backfillTrials();

    expect(guildMock.findMany).toHaveBeenCalledWith({
      where: { trialStartedAt: null, entitlementId: null, premiumTier: 'FREE' },
      select: { id: true, name: true },
    });
  });

  it('grants the trial for every eligible candidate', async () => {
    guildMock.findMany.mockResolvedValue([
      { id: 'g1', name: 'Alpha' },
      { id: 'g2', name: 'Beta' },
    ]);
    guildMock.updateMany.mockResolvedValue({ count: 1 });

    const result = await backfillTrials();

    expect(result).toEqual({ scanned: 2, granted: 2, skipped: 0 });
    expect(guildMock.updateMany).toHaveBeenCalledTimes(2);
  });

  it('attempts the grant exactly once per guild id on the first run', async () => {
    guildMock.findMany.mockResolvedValue([
      { id: 'g1', name: 'Alpha' },
      { id: 'g2', name: 'Beta' },
      { id: 'g3', name: 'Gamma' },
    ]);
    guildMock.updateMany.mockResolvedValue({ count: 1 });

    const result = await backfillTrials();

    expect(result).toEqual({ scanned: 3, granted: 3, skipped: 0 });
    expect(guildMock.updateMany).toHaveBeenCalledTimes(3);
    // One grant attempt per distinct guild — no guild is processed twice.
    const grantedIds = guildMock.updateMany.mock.calls.map(
      (call: any[]) => call[0].where.id,
    );
    expect(grantedIds.sort()).toEqual(['g1', 'g2', 'g3']);
  });

  it('is a no-op on a second run when no candidates are left', async () => {
    // Idempotency: after the first run every former candidate has trialStartedAt set,
    // so the pre-selection query returns nothing and the backfill never writes.
    guildMock.findMany.mockResolvedValue([]);

    const result = await backfillTrials();

    expect(result).toEqual({ scanned: 0, granted: 0, skipped: 0 });
    expect(guildMock.updateMany).not.toHaveBeenCalled();
    expect(guildMock.update).not.toHaveBeenCalled();
  });

  it('delegates the eligibility decision to grantTrialIfEligible instead of writing itself', async () => {
    guildMock.findMany.mockResolvedValue([{ id: 'g1', name: 'Alpha' }]);
    guildMock.updateMany.mockResolvedValue({ count: 1 });

    await backfillTrials();

    // The predicate must stay in the WHERE clause — that is what makes the backfill
    // atomic, idempotent and safe against paid entitlements.
    expect(guildMock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'g1',
          trialStartedAt: null,
          entitlementId: null,
          premiumTier: 'FREE',
        }),
      }),
    );
    expect(guildMock.update).not.toHaveBeenCalled();
  });

  it('counts guilds that are no longer eligible as skipped', async () => {
    guildMock.findMany.mockResolvedValue([
      { id: 'g1', name: 'Alpha' },
      { id: 'g2', name: 'Beta' },
    ]);
    // Second run semantics: the conditional update matches no row anymore.
    guildMock.updateMany.mockResolvedValue({ count: 0 });
    guildMock.findUnique.mockResolvedValue({ premiumTier: 'PREMIUM' });

    const result = await backfillTrials();

    expect(result).toEqual({ scanned: 2, granted: 0, skipped: 2 });
  });

  it('counts a partially ineligible batch without aborting the run', async () => {
    guildMock.findMany.mockResolvedValue([
      { id: 'g1', name: 'Alpha' },
      { id: 'g2', name: 'Beta' },
      { id: 'g3', name: 'Gamma' },
    ]);
    // g2 lost the race against a concurrent guildCreate that already granted the trial.
    guildMock.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    guildMock.findUnique.mockResolvedValue({ premiumTier: 'PREMIUM' });

    const result = await backfillTrials();

    expect(result).toEqual({ scanned: 3, granted: 2, skipped: 1 });
  });

  it('keeps running when a single guild fails', async () => {
    guildMock.findMany.mockResolvedValue([
      { id: 'g1', name: 'Alpha' },
      { id: 'g2', name: 'Beta' },
    ]);
    guildMock.updateMany
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValue({ count: 1 });

    const result = await backfillTrials();

    expect(result).toEqual({ scanned: 2, granted: 1, skipped: 1 });
    expect(console.error).toHaveBeenCalled();
  });

  it('does not write anything in dry-run mode', async () => {
    guildMock.findMany.mockResolvedValue([
      { id: 'g1', name: 'Alpha' },
      { id: 'g2', name: 'Beta' },
    ]);

    const result = await backfillTrials({ dryRun: true });

    expect(result).toEqual({ scanned: 2, granted: 0, skipped: 0 });
    expect(guildMock.updateMany).not.toHaveBeenCalled();
    expect(guildMock.update).not.toHaveBeenCalled();
  });
});
