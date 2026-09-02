jest.mock('../database/client');

import prisma from '../database/client';
import {
  getTier,
  syncEntitlement,
  hasFeature,
  FEATURE_TIERS,
  tryConsumeWeeklyRaid,
  grantTrialIfEligible,
  syncEntitlementsOnStartup,
  TRIAL_DAYS,
  clearTierCache,
  reapExpiredPremium,
  PremiumTier,
  PremiumFeature,
} from '../services/entitlementService';

beforeEach(() => {
  jest.clearAllMocks();
  clearTierCache();
});

describe('getTier()', () => {
  it('returns FREE for unknown guild', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(null);
    expect(await getTier('unknown')).toBe('FREE');
  });

  it('returns stored tier', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      premiumTier: 'PREMIUM',
      premiumExpiresAt: null,
    } as any);
    expect(await getTier('guild1')).toBe('PREMIUM');
  });

  it('returns FREE when subscription expired', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      premiumTier: 'PREMIUM',
      premiumExpiresAt: new Date('2020-01-01'),
    } as any);
    expect(await getTier('guild1')).toBe('FREE');
  });

  it('returns tier when subscription not yet expired', async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      premiumTier: 'PREMIUM',
      premiumExpiresAt: future,
    } as any);
    expect(await getTier('guild1')).toBe('PREMIUM');
  });
});

describe('syncEntitlement()', () => {
  it('sets tier and expiresAt', async () => {
    (prisma.guild.update as jest.Mock).mockResolvedValue({} as any);
    const expiresAt = new Date('2027-01-01');

    await syncEntitlement({
      guildId: 'guild1',
      tier: 'PREMIUM',
      expiresAt,
      entitlementId: 'ent_123',
      source: 'discord',
    });

    expect((prisma.guild.update as jest.Mock)).toHaveBeenCalledWith({
      where: { id: 'guild1' },
      data: {
        premiumTier: 'PREMIUM',
        premiumExpiresAt: expiresAt,
        entitlementId: 'ent_123',
      },
    });
  });

  it('clears entitlement fields on downgrade to FREE', async () => {
    (prisma.guild.update as jest.Mock).mockResolvedValue({} as any);

    await syncEntitlement({
      guildId: 'guild1',
      tier: 'FREE',
      source: 'discord',
    });

    expect((prisma.guild.update as jest.Mock)).toHaveBeenCalledWith({
      where: { id: 'guild1' },
      data: {
        premiumTier: 'FREE',
        premiumExpiresAt: null,
        entitlementId: null,
      },
    });
  });
});

describe('hasFeature()', () => {
  const allFeatures = Object.keys(FEATURE_TIERS) as PremiumFeature[];

  it('FREE tier has no gated features', () => {
    for (const feature of allFeatures) {
      expect(hasFeature('FREE', feature)).toBe(false);
    }
  });

  // Two-tier model: PREMIUM is the top tier, so it unlocks everything in FEATURE_TIERS.
  it('PREMIUM tier has every gated feature', () => {
    for (const feature of allFeatures) {
      expect(hasFeature('PREMIUM', feature)).toBe(true);
    }
  });

  // Weekly recurrence shipped FREE (2026-08-10). It sat here as an unimplemented PREMIUM
  // entry; gating the one mechanism that produces a second raid week would suppress the
  // usage the tier decision is supposed to measure. Guarded so it cannot drift back in.
  it('does not gate weekly recurring raids', () => {
    expect(allFeatures).not.toContain('raid.recurring');
    expect(FEATURE_TIERS).not.toHaveProperty('raid.recurring');
  });
});

describe('tryConsumeWeeklyRaid()', () => {
  it('returns full limit for unknown guild', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(null);
    const result = await tryConsumeWeeklyRaid('unknown');
    expect(result).toEqual(expect.objectContaining({ allowed: true, remaining: 5 }));
  });

  it('returns unlimited for PREMIUM tier without incrementing', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      premiumTier: 'PREMIUM',
      premiumExpiresAt: null,
      weeklyRaidCount: 99,
      weeklyRaidCountResetAt: new Date(),
    } as any);

    const result = await tryConsumeWeeklyRaid('guild1');
    expect(result).toEqual(expect.objectContaining({ allowed: true, remaining: Infinity }));
    expect((prisma.guild.update as jest.Mock)).not.toHaveBeenCalled();
  });

  it('consumes a slot and returns remaining for FREE tier', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      premiumTier: 'FREE',
      premiumExpiresAt: null,
      weeklyRaidCount: 3,
      weeklyRaidCountResetAt: new Date(),
    } as any);
    (prisma.guild.update as jest.Mock).mockResolvedValue({} as any);

    const result = await tryConsumeWeeklyRaid('guild1');
    expect(result).toEqual(expect.objectContaining({ allowed: true, remaining: 1 }));
    expect((prisma.guild.update as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ weeklyRaidCount: 4 }),
      }),
    );
  });

  it('blocks when limit already reached', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      premiumTier: 'FREE',
      premiumExpiresAt: null,
      weeklyRaidCount: 5,
      weeklyRaidCountResetAt: new Date(),
    } as any);

    const result = await tryConsumeWeeklyRaid('guild1');
    expect(result).toEqual(expect.objectContaining({ allowed: false, remaining: 0 }));
    expect((prisma.guild.update as jest.Mock)).not.toHaveBeenCalled();
  });

  it('resets counter and consumes when window expired', async () => {
    const eightDaysAgo = new Date();
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      premiumTier: 'FREE',
      premiumExpiresAt: null,
      weeklyRaidCount: 5,
      weeklyRaidCountResetAt: eightDaysAgo,
    } as any);
    (prisma.guild.update as jest.Mock).mockResolvedValue({} as any);

    const result = await tryConsumeWeeklyRaid('guild1');
    expect(result).toEqual(expect.objectContaining({ allowed: true, remaining: 4 }));
    expect((prisma.guild.update as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ weeklyRaidCount: 1 }),
      }),
    );
  });

  it('resets counter when resetAt is null', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      premiumTier: 'FREE',
      premiumExpiresAt: null,
      weeklyRaidCount: 3,
      weeklyRaidCountResetAt: null,
    } as any);
    (prisma.guild.update as jest.Mock).mockResolvedValue({} as any);

    const result = await tryConsumeWeeklyRaid('guild1');
    expect(result).toEqual(expect.objectContaining({ allowed: true, remaining: 4 }));
  });

  it('treats expired premium as FREE tier', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      premiumTier: 'PREMIUM',
      premiumExpiresAt: new Date('2020-01-01'),
      weeklyRaidCount: 5,
      weeklyRaidCountResetAt: new Date(),
    } as any);

    const result = await tryConsumeWeeklyRaid('guild1');
    expect(result).toEqual(expect.objectContaining({ allowed: false, remaining: 0 }));
  });

  it('runs inside a transaction', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      premiumTier: 'FREE',
      premiumExpiresAt: null,
      weeklyRaidCount: 0,
      weeklyRaidCountResetAt: new Date(),
    } as any);
    (prisma.guild.update as jest.Mock).mockResolvedValue({} as any);

    await tryConsumeWeeklyRaid('guild1');
    expect((prisma.$transaction as jest.Mock)).toHaveBeenCalled();
  });
});

describe('grantTrialIfEligible()', () => {
  it('grants a TRIAL_DAYS-long PREMIUM trial via a single atomic conditional update', async () => {
    // Eligibility lives in the WHERE clause; the DB reports one row was updated.
    (prisma.guild.updateMany as jest.Mock).mockResolvedValue({ count: 1 } as any);

    const before = Date.now();
    const result = await grantTrialIfEligible('guild1');
    const after = Date.now();

    expect(result.granted).toBe(true);
    expect(result.tier).toBe('PREMIUM');

    // The grant must be a single atomic updateMany — no read-then-write.
    expect((prisma.guild.updateMany as jest.Mock)).toHaveBeenCalledTimes(1);
    expect((prisma.guild.findUnique as jest.Mock)).not.toHaveBeenCalled();

    const update = (prisma.guild.updateMany as jest.Mock).mock.calls[0][0];
    // The conditional predicate that closes the TOCTOU window.
    expect(update.where).toEqual({
      id: 'guild1',
      trialStartedAt: null,
      entitlementId: null,
      premiumTier: 'FREE',
    });
    expect(update.data.premiumTier).toBe('PREMIUM');
    expect(update.data.trialStartedAt).toBeInstanceOf(Date);

    // Expiry is ~TRIAL_DAYS out.
    const expiryMs = (update.data.premiumExpiresAt as Date).getTime();
    const expectedMin = before + TRIAL_DAYS * 24 * 60 * 60 * 1000;
    const expectedMax = after + TRIAL_DAYS * 24 * 60 * 60 * 1000;
    expect(expiryMs).toBeGreaterThanOrEqual(expectedMin);
    expect(expiryMs).toBeLessThanOrEqual(expectedMax);
  });

  it('does not grant when no row matched the eligibility predicate (already used / paid)', async () => {
    // count === 0 → the guild was no longer eligible when the write ran.
    (prisma.guild.updateMany as jest.Mock).mockResolvedValue({ count: 0 } as any);
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ premiumTier: 'FREE' } as any);

    const result = await grantTrialIfEligible('guild1');
    expect(result.granted).toBe(false);
    expect(result.tier).toBe('FREE');
    expect((prisma.guild.updateMany as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it('reports the current paid tier when the conditional grant matched nothing', async () => {
    (prisma.guild.updateMany as jest.Mock).mockResolvedValue({ count: 0 } as any);
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ premiumTier: 'PREMIUM' } as any);

    const result = await grantTrialIfEligible('guild1');
    expect(result.granted).toBe(false);
    expect(result.tier).toBe('PREMIUM');
  });

  it('does not grant for an unknown guild', async () => {
    (prisma.guild.updateMany as jest.Mock).mockResolvedValue({ count: 0 } as any);
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await grantTrialIfEligible('unknown');
    expect(result.granted).toBe(false);
    expect(result.tier).toBe('FREE');
  });
});

describe('syncEntitlementsOnStartup()', () => {
  const OLD_SKU = process.env.DISCORD_SKU_PREMIUM;

  const clientWith = (overrides: {
    appId?: string | undefined;
    get?: jest.Mock;
  }) => ({
    application: overrides.appId === undefined ? null : { id: overrides.appId },
    rest: { get: overrides.get ?? jest.fn().mockResolvedValue([]) },
  }) as any;

  beforeEach(() => {
    process.env.DISCORD_SKU_PREMIUM = 'sku-premium';
    (prisma.guild.update as jest.Mock).mockResolvedValue({} as any);
  });

  afterAll(() => {
    process.env.DISCORD_SKU_PREMIUM = OLD_SKU;
  });

  it('reports ok when every entitlement synced', async () => {
    const get = jest.fn().mockResolvedValue([
      { id: 'ent1', sku_id: 'sku-premium', guild_id: 'g1', ends_at: '2099-01-01T00:00:00Z' },
    ]);

    const result = await syncEntitlementsOnStartup(clientWith({ appId: 'app1', get }));

    expect(result).toEqual({ ok: true });
    expect(prisma.guild.update).toHaveBeenCalled();
  });

  it('reports ok when there is nothing to sync', async () => {
    const result = await syncEntitlementsOnStartup(clientWith({ appId: 'app1' }));
    expect(result).toEqual({ ok: true });
  });

  it('reports ok when entitlements are skipped for an unknown SKU', async () => {
    const get = jest.fn().mockResolvedValue([
      { id: 'ent1', sku_id: 'some-other-sku', guild_id: 'g1' },
    ]);

    const result = await syncEntitlementsOnStartup(clientWith({ appId: 'app1', get }));

    expect(result).toEqual({ ok: true });
    expect(prisma.guild.update).not.toHaveBeenCalled();
  });

  it('reports not-ok when the application ID is unavailable', async () => {
    const result = await syncEntitlementsOnStartup(clientWith({ appId: undefined }));
    expect(result).toEqual({ ok: false });
  });

  it('reports not-ok when the Discord REST call fails', async () => {
    const get = jest.fn().mockRejectedValue(new Error('503 Service Unavailable'));

    const result = await syncEntitlementsOnStartup(clientWith({ appId: 'app1', get }));

    expect(result).toEqual({ ok: false });
  });

  it('reports not-ok when a DB write fails mid-sync', async () => {
    // The paid entitlement never lands in the DB — exactly the state the trial backfill
    // must not act on, since the guild still looks FREE with a NULL entitlementId.
    const get = jest.fn().mockResolvedValue([
      { id: 'ent1', sku_id: 'sku-premium', guild_id: 'g1' },
      { id: 'ent2', sku_id: 'sku-premium', guild_id: 'g2' },
    ]);
    (prisma.guild.update as jest.Mock).mockRejectedValueOnce(new Error('connection lost'));

    const result = await syncEntitlementsOnStartup(clientWith({ appId: 'app1', get }));

    expect(result).toEqual({ ok: false });
  });

  it('does not throw on failure — startup must continue', async () => {
    const get = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(
      syncEntitlementsOnStartup(clientWith({ appId: 'app1', get })),
    ).resolves.toEqual({ ok: false });
  });
});

describe('reapExpiredPremium()', () => {
  /** Convenience: the reaper reads ids, then writes. Wire both halves of that pair. */
  const givenExpiredGuilds = (ids: string[]) => {
    (prisma.guild.findMany as jest.Mock).mockResolvedValue(ids.map((id) => ({ id })) as any);
    (prisma.guild.updateMany as jest.Mock).mockResolvedValue({ count: ids.length } as any);
  };

  it('downgrades guilds whose premium has expired', async () => {
    givenExpiredGuilds(['guild1', 'guild2']);

    expect(await reapExpiredPremium()).toBe(2);

    expect(prisma.guild.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['guild1', 'guild2'] } }),
        data: { premiumTier: 'FREE' },
      }),
    );
  });

  // The one rule this job must never break: the paying customer keeps their tier.
  it('never selects guilds with a linked paid entitlement', async () => {
    givenExpiredGuilds([]);

    await reapExpiredPremium();

    // Both the candidate read and the write must exclude linked entitlements, so a
    // paid guild can neither be picked up nor written to.
    expect(prisma.guild.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ entitlementId: null }) }),
    );
    expect(prisma.guild.updateMany).not.toHaveBeenCalled();
  });

  it('leaves a paying guild alone even when its premiumExpiresAt has passed', async () => {
    // The full live shape: an expired date, but an entitlement id — a renewal question
    // for the provider, not an expiry for this job. The predicate must filter it out.
    const paying = {
      id: 'paying-guild',
      premiumTier: 'PREMIUM',
      premiumExpiresAt: new Date('2020-01-01'),
      entitlementId: 'discord-entitlement-1',
    };

    (prisma.guild.findMany as jest.Mock).mockImplementation((async (args: any) => {
      const rows = [paying].filter((guild) => {
        if (args.where.entitlementId === null && guild.entitlementId !== null) return false;
        if (guild.premiumTier === 'FREE') return false;
        return guild.premiumExpiresAt < args.where.premiumExpiresAt.lt;
      });
      return rows.map((guild) => ({ id: guild.id }));
    }) as any);

    expect(await reapExpiredPremium()).toBe(0);
    expect(prisma.guild.updateMany).not.toHaveBeenCalled();
  });

  it('only targets guilds that are not already FREE, and does not clear the expiry or trial stamp', async () => {
    givenExpiredGuilds(['guild1']);

    await reapExpiredPremium();

    const readWhere = (prisma.guild.findMany as jest.Mock).mock.calls[0][0].where;
    expect(readWhere.premiumTier).toEqual({ not: 'FREE' });
    expect(readWhere.premiumExpiresAt.lt).toBeInstanceOf(Date);

    // premiumExpiresAt is the audit trail; trialStartedAt keeps a spent trial spent.
    const written = (prisma.guild.updateMany as jest.Mock).mock.calls[0][0].data;
    expect(written).toEqual({ premiumTier: 'FREE' });
  });

  it('is a no-op when nothing has expired', async () => {
    (prisma.guild.findMany as jest.Mock).mockResolvedValue([] as any);

    expect(await reapExpiredPremium()).toBe(0);
    expect(prisma.guild.updateMany).not.toHaveBeenCalled();
  });

  it('drops the cached tier for every downgraded guild', async () => {
    // Warm the cache as PREMIUM via a stored row that has not expired yet.
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      premiumTier: 'PREMIUM',
      premiumExpiresAt: new Date(Date.now() + 60_000),
    } as any);
    expect(await getTier('guild1')).toBe('PREMIUM');

    givenExpiredGuilds(['guild1']);
    await reapExpiredPremium();

    // Without the invalidation this would still read PREMIUM from the 30s cache.
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      premiumTier: 'FREE',
      premiumExpiresAt: new Date('2020-01-01'),
    } as any);
    expect(await getTier('guild1')).toBe('FREE');
  });

  it('is idempotent — a second pass finds nothing left to do', async () => {
    givenExpiredGuilds(['guild1']);
    expect(await reapExpiredPremium()).toBe(1);

    // After the write the guild is FREE, so it no longer matches `premiumTier: not FREE`.
    (prisma.guild.findMany as jest.Mock).mockResolvedValue([] as any);
    (prisma.guild.updateMany as jest.Mock).mockClear();

    expect(await reapExpiredPremium()).toBe(0);
    expect(prisma.guild.updateMany).not.toHaveBeenCalled();
  });
});
