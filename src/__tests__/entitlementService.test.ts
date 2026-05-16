jest.mock('../database/client');

import prisma from '../database/client';
import {
  getTier,
  syncEntitlement,
  hasFeature,
  tryConsumeWeeklyRaid,
  clearTierCache,
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
      premiumTier: 'PRO',
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
  const premiumFeatures: PremiumFeature[] = ['raid.optout_reason', 'raid.archive', 'raid.recurring', 'stats.full_history', 'stats.analytics'];
  const proFeatures: PremiumFeature[] = ['raid.template', 'stats.export', 'raid.integrations'];

  it('FREE tier has no gated features', () => {
    for (const feature of [...premiumFeatures, ...proFeatures]) {
      expect(hasFeature('FREE', feature)).toBe(false);
    }
  });

  it('PREMIUM tier has premium features', () => {
    for (const feature of premiumFeatures) {
      expect(hasFeature('PREMIUM', feature)).toBe(true);
    }
  });

  it('PREMIUM tier does not have PRO features', () => {
    for (const feature of proFeatures) {
      expect(hasFeature('PREMIUM', feature)).toBe(false);
    }
  });

  it('PRO tier has all features', () => {
    for (const feature of [...premiumFeatures, ...proFeatures]) {
      expect(hasFeature('PRO', feature)).toBe(true);
    }
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

  it('returns unlimited for PRO tier', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      premiumTier: 'PRO',
      premiumExpiresAt: null,
      weeklyRaidCount: 99,
      weeklyRaidCountResetAt: new Date(),
    } as any);

    const result = await tryConsumeWeeklyRaid('guild1');
    expect(result).toEqual(expect.objectContaining({ allowed: true, remaining: Infinity }));
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
