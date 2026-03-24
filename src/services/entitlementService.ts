import { PremiumTier } from '@prisma/client';
import { Client } from 'discord.js';
import prisma from '../database/client';

export { PremiumTier };

export type PremiumFeature =
  | 'raid.optout_reason'
  | 'raid.archive'
  | 'raid.recurring'
  | 'raid.template'
  | 'raid.integrations'
  | 'stats.full_history'
  | 'stats.analytics'
  | 'stats.export';

/** Feature → minimum tier required */
export const FEATURE_TIERS: Record<PremiumFeature, PremiumTier> = {
  'raid.optout_reason': 'PREMIUM',
  'raid.archive': 'PREMIUM',
  'raid.recurring': 'PREMIUM',
  'stats.full_history': 'PREMIUM',
  'stats.analytics': 'PREMIUM',
  'raid.template': 'PRO',
  'stats.export': 'PRO',
  'raid.integrations': 'PRO',
};

/** Maps a Discord SKU ID to its premium tier. */
export function skuToTier(skuId: string): PremiumTier | null {
  if (skuId === process.env.DISCORD_SKU_PRO) return 'PRO';
  if (skuId === process.env.DISCORD_SKU_PREMIUM) return 'PREMIUM';
  return null;
}

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
 * Atomically checks and consumes a weekly raid slot for a guild.
 * Free tier: 5 raids/week. Premium/Pro: unlimited.
 * Auto-resets the counter when the 7-day window expires.
 *
 * Returns { allowed, remaining } — if allowed, the count has already been incremented.
 * This prevents race conditions where two concurrent creates both pass the check.
 */
export async function tryConsumeWeeklyRaid(guildId: string): Promise<{ allowed: boolean; remaining: number }> {
  return prisma.$transaction(async (tx) => {
    const guild = await tx.guild.findUnique({
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

    let currentCount = guild.weeklyRaidCount;

    // Reset window if expired or never set
    if (!resetAt || now.getTime() - resetAt.getTime() >= sevenDaysMs) {
      currentCount = 0;
    }

    if (currentCount >= FREE_WEEKLY_RAID_LIMIT) {
      return { allowed: false, remaining: 0 };
    }

    // Atomically increment and (re)set the window
    await tx.guild.update({
      where: { id: guildId },
      data: {
        weeklyRaidCount: currentCount + 1,
        weeklyRaidCountResetAt: !resetAt || now.getTime() - resetAt.getTime() >= sevenDaysMs ? now : resetAt,
      },
    });

    const remaining = FREE_WEEKLY_RAID_LIMIT - (currentCount + 1);
    return { allowed: true, remaining };
  });
}

/**
 * Syncs all active entitlements from Discord on startup.
 * Ensures the DB reflects current subscription state even after restarts.
 */
export async function syncEntitlementsOnStartup(client: Client): Promise<void> {
  const appId = client.application?.id;
  if (!appId) {
    console.warn('⚠️ Could not sync entitlements: application ID not available');
    return;
  }

  try {
    // Use REST API directly — discord.js fetch() may filter out test entitlements
    const entitlements = await client.rest.get(
      `/applications/${appId}/entitlements?exclude_ended=true`,
    ) as Array<{ id: string; sku_id: string; guild_id?: string; ends_at?: string }>;

    let synced = 0;
    let skipped = 0;

    for (const entitlement of entitlements) {
      const tier = skuToTier(entitlement.sku_id);
      if (!tier) {
        skipped++;
        continue;
      }

      const guildId = entitlement.guild_id;
      if (!guildId) {
        skipped++;
        continue;
      }

      await syncEntitlement({
        guildId,
        tier,
        expiresAt: entitlement.ends_at ? new Date(entitlement.ends_at) : undefined,
        entitlementId: entitlement.id,
        source: 'discord',
      });
      synced++;
    }

    console.log(`💎 Startup entitlement sync: ${synced} synced, ${skipped} skipped`);
  } catch (error) {
    console.error('❌ Failed to sync entitlements on startup:', error);
  }
}
