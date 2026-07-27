jest.mock('../database/client');

import { premiumUpsellEmbed } from '../middleware/premiumGate';
import {
  canCreateAdditionalTeam,
  clearTierCache,
  FREE_TEAM_LIMIT,
  hasFeature,
  PremiumTier,
} from '../services/entitlementService';
import prisma from '../database/client';

const mockPrisma = prisma as unknown as {
  guild: { findUnique: jest.Mock };
};

/** Makes `getTier(guildId)` resolve to the given tier for the next lookup. */
function guildOnTier(tier: PremiumTier) {
  mockPrisma.guild.findUnique.mockResolvedValue({ premiumTier: tier, premiumExpiresAt: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  // getTier caches per guild for 30s — without this, tier changes between tests leak.
  clearTierCache();
});

describe('hasFeature(tier, "team.multi")', () => {
  it('denies multi-team on FREE', () => {
    expect(hasFeature('FREE', 'team.multi')).toBe(false);
  });

  it('allows multi-team on PREMIUM', () => {
    expect(hasFeature('PREMIUM', 'team.multi')).toBe(true);
  });
});

describe('canCreateAdditionalTeam()', () => {
  it('allows the first team on FREE', async () => {
    guildOnTier('FREE');
    expect(await canCreateAdditionalTeam('guild1', 0)).toBe(true);
  });

  it('blocks a second team on FREE', async () => {
    guildOnTier('FREE');
    expect(await canCreateAdditionalTeam('guild1', 1)).toBe(false);
  });

  it('allows a second team on PREMIUM', async () => {
    guildOnTier('PREMIUM');
    expect(await canCreateAdditionalTeam('guild1', 1)).toBe(true);
  });

  it('allows an eighth team on PREMIUM — the tier is unlimited', async () => {
    guildOnTier('PREMIUM');
    expect(await canCreateAdditionalTeam('guild1', 7)).toBe(true);
  });

  it('caps FREE at exactly FREE_TEAM_LIMIT teams', async () => {
    guildOnTier('FREE');
    expect(FREE_TEAM_LIMIT).toBe(1);
    expect(await canCreateAdditionalTeam('guild1', FREE_TEAM_LIMIT - 1)).toBe(true);
    clearTierCache();
    guildOnTier('FREE');
    expect(await canCreateAdditionalTeam('guild1', FREE_TEAM_LIMIT)).toBe(false);
  });

  it('treats an expired premium subscription as FREE', async () => {
    mockPrisma.guild.findUnique.mockResolvedValue({
      premiumTier: 'PREMIUM',
      premiumExpiresAt: new Date(Date.now() - 1000),
    });
    expect(await canCreateAdditionalTeam('guild1', 1)).toBe(false);
  });
});

describe('premiumUpsellEmbed("team.multi")', () => {
  it('renders the localized feature name and the perks field in German', () => {
    const embed = premiumUpsellEmbed('team.multi', 'FREE', 'PREMIUM', 'de').toJSON();

    expect(embed.title).toContain('Mehrere Teams');
    expect(embed.title).toContain('Premium-Funktion');
    expect(embed.description).toContain('Mehrere Teams');

    const perksField = embed.fields?.find((f: any) => !f.inline);
    expect(perksField?.name).toBe('💎 Premium');
    expect(perksField?.value).toContain('Mehrere Teams');
  });

  it('renders the localized feature name and the perks field in English', () => {
    const embed = premiumUpsellEmbed('team.multi', 'FREE', 'PREMIUM', 'en').toJSON();

    expect(embed.title).toContain('Multiple Teams');
    expect(embed.fields?.slice(0, 2)).toEqual([
      { name: 'Your Plan', value: 'Free', inline: true },
      { name: 'Required Plan', value: 'Premium', inline: true },
    ]);
    expect(embed.fields?.find((f: any) => !f.inline)?.value).toContain('Multiple teams');
  });
});
