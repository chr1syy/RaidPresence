import { PremiumTier } from '@prisma/client';
import prisma from '../database/client';

export { PremiumTier };

export type PremiumFeature =
  | 'raid.notes'
  | 'raid.archive'
  | 'raid.recurring'
  | 'raid.template'
  | 'raid.integrations'
  | 'stats.full_history'
  | 'stats.export';

/** Feature → minimum tier required */
export const FEATURE_TIERS: Record<PremiumFeature, PremiumTier> = {
  'raid.notes': 'PREMIUM',
  'raid.archive': 'PREMIUM',
  'raid.recurring': 'PREMIUM',
  'stats.full_history': 'PREMIUM',
  'raid.template': 'PRO',
  'stats.export': 'PRO',
  'raid.integrations': 'PRO',
};

const TIER_RANK: Record<PremiumTier, number> = {
  FREE: 0,
  PREMIUM: 1,
  PRO: 2,
};

const FREE_WEEKLY_RAID_LIMIT = 5;

/**
 * Returns the effective premium tier for a guild.
 * If the subscription has expired, returns FREE.
 */
export async function getTier(guildId: string): Promise<PremiumTier> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { premiumTier: true, premiumExpiresAt: true },
  });

  if (!guild) return 'FREE';

  if (guild.premiumExpiresAt && guild.premiumExpiresAt < new Date()) {
    return 'FREE';
  }

  return guild.premiumTier;
}

/**
 * Syncs a guild's premium entitlement from an external provider.
 * Provider-agnostic — works for both Discord and Stripe.
 */
export async function syncEntitlement(params: {
  guildId: string;
  tier: PremiumTier;
  expiresAt?: Date;
  entitlementId?: string;
  source: 'discord' | 'stripe';
}): Promise<void> {
  const { guildId, tier, expiresAt, entitlementId, source } = params;

  if (tier === 'FREE') {
    await prisma.guild.update({
      where: { id: guildId },
      data: {
        premiumTier: 'FREE',
        premiumExpiresAt: null,
        entitlementId: null,
      },
    });
  } else {
    await prisma.guild.update({
      where: { id: guildId },
      data: {
        premiumTier: tier,
        premiumExpiresAt: expiresAt ?? null,
        entitlementId: entitlementId ?? undefined,
      },
    });
  }

  console.log(`💎 Premium synced: guild=${guildId} tier=${tier} source=${source}`);
}

/**
 * Checks whether a tier has access to a given feature.
 * Pure function — no DB call.
 */
export function hasFeature(tier: PremiumTier, feature: PremiumFeature): boolean {
  const requiredTier = FEATURE_TIERS[feature];
  return TIER_RANK[tier] >= TIER_RANK[requiredTier];
}

/**
 * Checks whether a guild can create another raid this week.
 * Free tier: 5 raids/week. Premium/Pro: unlimited.
 * Auto-resets the counter when the 7-day window expires.
 */
export async function checkWeeklyLimit(guildId: string): Promise<{ allowed: boolean; remaining: number }> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { premiumTier: true, premiumExpiresAt: true, weeklyRaidCount: true, weeklyRaidCountResetAt: true },
  });

  if (!guild) return { allowed: true, remaining: FREE_WEEKLY_RAID_LIMIT };

  const effectiveTier =
    guild.premiumExpiresAt && guild.premiumExpiresAt < new Date() ? 'FREE' : guild.premiumTier;

  if (effectiveTier !== 'FREE') {
    return { allowed: true, remaining: Infinity };
  }

  const now = new Date();
  const resetAt = guild.weeklyRaidCountResetAt;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  // Reset window if expired or never set
  if (!resetAt || now.getTime() - resetAt.getTime() >= sevenDaysMs) {
    await prisma.guild.update({
      where: { id: guildId },
      data: { weeklyRaidCount: 0, weeklyRaidCountResetAt: now },
    });
    return { allowed: true, remaining: FREE_WEEKLY_RAID_LIMIT };
  }

  const remaining = Math.max(0, FREE_WEEKLY_RAID_LIMIT - guild.weeklyRaidCount);
  return { allowed: remaining > 0, remaining };
}

/**
 * Increments the weekly raid count after a successful raid creation.
 * Initializes the reset window if not already set.
 */
export async function incrementWeeklyRaidCount(guildId: string): Promise<void> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { weeklyRaidCountResetAt: true },
  });

  await prisma.guild.update({
    where: { id: guildId },
    data: {
      weeklyRaidCount: { increment: 1 },
      weeklyRaidCountResetAt: guild?.weeklyRaidCountResetAt ?? new Date(),
    },
  });
}
