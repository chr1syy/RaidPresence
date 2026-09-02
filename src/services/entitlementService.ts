import { PremiumTier } from '@prisma/client';
import { Client } from 'discord.js';
import prisma from '../database/client';

export { PremiumTier };

export type PremiumFeature =
  | 'raid.optout_reason'
  | 'raid.archive'
  | 'raid.template'
  | 'raid.integrations'
  | 'stats.full_history'
  | 'stats.analytics'
  | 'stats.export'
  | 'team.multi';

/**
 * Feature → minimum tier required.
 *
 * Weekly recurring raids are deliberately NOT in here. `raid.recurring` sat in this map
 * as PREMIUM while being completely unimplemented, and when it was actually built
 * (2026-08-10) it shipped FREE: no guild has ever hit a free-tier ceiling (zero above the
 * 5-raids-per-week limit, zero with more than one team), so gating the one mechanism that
 * produces a second raid week would only suppress the usage we want to measure. What gets
 * monetised is what *comes out of* retention — archive, analytics, teams — not retention
 * itself.
 */
export const FEATURE_TIERS: Record<PremiumFeature, PremiumTier> = {
  'raid.optout_reason': 'PREMIUM',
  'raid.archive': 'PREMIUM',
  'stats.full_history': 'PREMIUM',
  'stats.analytics': 'PREMIUM',
  'raid.template': 'PREMIUM',
  'stats.export': 'PREMIUM',
  'raid.integrations': 'PREMIUM',
  'team.multi': 'PREMIUM',
};

/** Maps a Discord SKU ID to its premium tier. */
export function skuToTier(skuId: string): PremiumTier | null {
  if (skuId === process.env.DISCORD_SKU_PREMIUM) return 'PREMIUM';
  return null;
}

const TIER_RANK: Record<PremiumTier, number> = {
  FREE: 0,
  PREMIUM: 1,
};

const FREE_WEEKLY_RAID_LIMIT = 5;

/** Number of teams a FREE guild may have (just the default "Main" team). */
export const FREE_TEAM_LIMIT = 1;

/** In-memory tier cache with 30s TTL — keeps button interactions fast */
const tierCache = new Map<string, { tier: PremiumTier; expiresAt: number }>();
const TIER_CACHE_TTL_MS = 30_000;

/**
 * Returns the effective premium tier for a guild.
 * If the subscription has expired, returns FREE.
 * Results are cached for 30s to keep button interactions responsive.
 */
export async function getTier(guildId: string): Promise<PremiumTier> {
  const cached = tierCache.get(guildId);
  if (cached) {
    if (cached.expiresAt > Date.now()) {
      return cached.tier;
    }
    tierCache.delete(guildId);
  }

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { premiumTier: true, premiumExpiresAt: true },
  });

  let tier: PremiumTier = 'FREE';
  if (guild) {
    tier = guild.premiumExpiresAt && guild.premiumExpiresAt < new Date() ? 'FREE' : guild.premiumTier;
  }

  tierCache.set(guildId, { tier, expiresAt: Date.now() + TIER_CACHE_TTL_MS });
  return tier;
}

/** Invalidates the tier cache for a guild (call after entitlement sync). */
export function invalidateTierCache(guildId: string): void {
  tierCache.delete(guildId);
}

/** Clears the entire tier cache (for testing). */
export function clearTierCache(): void {
  tierCache.clear();
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

  invalidateTierCache(guildId);
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
 * Checks whether a guild may create another team.
 *
 * PREMIUM guilds have unlimited teams. FREE guilds are capped at
 * `FREE_TEAM_LIMIT` (the default "Main" team) — a second team is the
 * upsell trigger for the `team.multi` feature.
 */
export async function canCreateAdditionalTeam(
  guildId: string,
  currentTeamCount: number,
): Promise<boolean> {
  if (hasFeature(await getTier(guildId), 'team.multi')) return true;
  return currentTeamCount < FREE_TEAM_LIMIT;
}

/**
 * Total number of teams the guild's current tier allows, or `null` for unlimited.
 *
 * Handed to `createTeamWithinLimit()` so the limit is enforced inside the insert's
 * transaction instead of only in the command's pre-check.
 */
export async function teamLimitFor(guildId: string): Promise<number | null> {
  return hasFeature(await getTier(guildId), 'team.multi') ? null : FREE_TEAM_LIMIT;
}

/**
 * Atomically checks and consumes a weekly raid slot for a guild.
 * Free tier: 5 raids/week. Premium: unlimited.
 * Auto-resets the counter when the 7-day window expires.
 *
 * Returns { allowed, remaining } — if allowed, the count has already been incremented.
 * This prevents race conditions where two concurrent creates both pass the check.
 */
export async function tryConsumeWeeklyRaid(guildId: string): Promise<{ allowed: boolean; remaining: number; max: number; resetAt: Date | null }> {
  return prisma.$transaction(async (tx) => {
    const guild = await tx.guild.findUnique({
      where: { id: guildId },
      select: { premiumTier: true, premiumExpiresAt: true, weeklyRaidCount: true, weeklyRaidCountResetAt: true },
    });

    if (!guild) return { allowed: true, remaining: FREE_WEEKLY_RAID_LIMIT, max: FREE_WEEKLY_RAID_LIMIT, resetAt: null };

    const effectiveTier =
      guild.premiumExpiresAt && guild.premiumExpiresAt < new Date() ? 'FREE' : guild.premiumTier;

    if (effectiveTier !== 'FREE') {
      return { allowed: true, remaining: Infinity, max: Infinity, resetAt: null };
    }

    const now = new Date();
    const windowStart = guild.weeklyRaidCountResetAt;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    let currentCount = guild.weeklyRaidCount;
    let effectiveWindowStart = windowStart;

    // Reset window if expired or never set
    if (!windowStart || now.getTime() - windowStart.getTime() >= sevenDaysMs) {
      currentCount = 0;
      effectiveWindowStart = now;
    }

    const windowResetAt = effectiveWindowStart ? new Date(effectiveWindowStart.getTime() + sevenDaysMs) : null;

    if (currentCount >= FREE_WEEKLY_RAID_LIMIT) {
      return { allowed: false, remaining: 0, max: FREE_WEEKLY_RAID_LIMIT, resetAt: windowResetAt };
    }

    // Atomically increment and (re)set the window
    await tx.guild.update({
      where: { id: guildId },
      data: {
        weeklyRaidCount: currentCount + 1,
        weeklyRaidCountResetAt: effectiveWindowStart,
      },
    });

    const remaining = FREE_WEEKLY_RAID_LIMIT - (currentCount + 1);
    return { allowed: true, remaining, max: FREE_WEEKLY_RAID_LIMIT, resetAt: windowResetAt };
  });
}

/**
 * Length of the auto-granted new-guild premium trial, in days.
 *
 * Raised from 14 to 30 on 2026-08-03: two weeks is not enough to see a raid cycle
 * through on a server that only runs one or two nights a week. Changing this only
 * affects guilds granted a trial *after* the change — `premiumExpiresAt` is stamped
 * once at grant time. Trials already running are moved by `src/scripts/extendTrials.ts`.
 */
export const TRIAL_DAYS = 30;

export interface TrialGrantResult {
  granted: boolean;
  tier: PremiumTier;
  expiresAt: Date | null;
}

/**
 * Grants a one-time {@link TRIAL_DAYS}-day PREMIUM trial to a guild, if eligible.
 *
 * Eligible only when the guild has never had a trial (`trialStartedAt` is null),
 * is currently on FREE, and has no linked paid entitlement. This keeps the grant
 * idempotent across re-installs and never clobbers an active subscription.
 *
 * Returns whether a trial was granted plus the resulting tier/expiry.
 */
export async function grantTrialIfEligible(guildId: string): Promise<TrialGrantResult> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  // Atomic conditional grant: the eligibility predicate lives in the WHERE clause,
  // so the DB only writes when the guild is *still* eligible (never had a trial, no
  // linked paid entitlement, currently FREE). This closes the read-then-write TOCTOU
  // window where two concurrent guildCreate events could both pass a separate read
  // and double-grant. `id` is unique, so this matches at most one row.
  const { count } = await prisma.guild.updateMany({
    where: {
      id: guildId,
      trialStartedAt: null,
      entitlementId: null,
      premiumTier: 'FREE',
    },
    data: {
      premiumTier: 'PREMIUM',
      premiumExpiresAt: expiresAt,
      trialStartedAt: now,
    },
  });

  if (count === 0) {
    // Not eligible (unknown guild, prior trial, paid entitlement, or already paid).
    // Report the current tier if the guild exists.
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { premiumTier: true },
    });
    return { granted: false, tier: guild?.premiumTier ?? 'FREE', expiresAt: null };
  }

  invalidateTierCache(guildId);
  console.log(`🎁 Premium trial granted: guild=${guildId} tier=PREMIUM expiresAt=${expiresAt.toISOString()}`);

  return { granted: true, tier: 'PREMIUM', expiresAt };
}

/**
 * Result of the startup entitlement sync.
 *
 * `ok` is false whenever the sync did not complete cleanly (missing application ID,
 * failed REST call, or a failed DB write). Callers that make decisions based on the
 * *absence* of a paid entitlement — most importantly the trial backfill — must skip
 * their work when `ok` is false: a guild whose paid entitlement failed to write would
 * otherwise look like a FREE guild and be handed a trial instead of its paid tier.
 */
export interface StartupSyncResult {
  ok: boolean;
}

/**
 * Syncs all active entitlements from Discord on startup.
 * Ensures the DB reflects current subscription state even after restarts.
 *
 * Never throws — errors are logged and reported via the returned `ok` flag so startup
 * continues, while downstream steps can still tell a clean sync from a broken one.
 */
export async function syncEntitlementsOnStartup(client: Client): Promise<StartupSyncResult> {
  const appId = client.application?.id;
  if (!appId) {
    console.warn('⚠️ Could not sync entitlements: application ID not available');
    return { ok: false };
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
    return { ok: true };
  } catch (error) {
    console.error('❌ Failed to sync entitlements on startup:', error);
    return { ok: false };
  }
}

/**
 * Resets `premiumTier` to FREE for guilds whose `premiumExpiresAt` has passed.
 *
 * This is **data hygiene, not a behaviour change**. `getTier()` already treats an expired
 * `premiumExpiresAt` as FREE, so every runtime gate — features, team limits, the weekly
 * raid cap — has been returning FREE for these guilds all along. What was never corrected
 * is the stored column: nothing writes `premiumTier` back down when a trial lapses, so it
 * stays PREMIUM forever. Anything reading the column directly instead of calling
 * `getTier()` — SQL, dashboards, analytics — therefore counts lapsed trials as paying
 * customers. On 2026-09-01 that was 42 of 56 live guilds: the column said 56 premium, the
 * truth was 14.
 *
 * Guilds with an `entitlementId` are excluded unconditionally. That column is only set for
 * a linked paid subscription, and its lifecycle belongs to the provider — Discord's
 * entitlement events and `syncEntitlement()`. A paid subscription whose `premiumExpiresAt`
 * has passed is a renewal question, not an expiry, and this job must never be the thing
 * that downgrades a paying customer.
 *
 * Idempotent: reaped guilds no longer match `premiumTier: { not: 'FREE' }`, so a second
 * run selects nothing. `premiumExpiresAt` and `trialStartedAt` are deliberately left in
 * place — the former is the audit trail of when the tier lapsed, and clearing the latter
 * would make a spent trial look unused and re-grantable.
 *
 * Returns the number of guilds downgraded.
 */
export async function reapExpiredPremium(): Promise<number> {
  const now = new Date();

  const where = {
    premiumTier: { not: 'FREE' as PremiumTier },
    premiumExpiresAt: { lt: now },
    entitlementId: null,
  };

  // Read the ids first: `updateMany` returns only a count, and each downgraded guild
  // needs its cached tier dropped. The rows are re-checked against the same predicate
  // inside the update, so a guild that buys premium between the two statements is not
  // clobbered by a stale id list.
  const expired = await prisma.guild.findMany({ where, select: { id: true } });

  if (expired.length === 0) return 0;

  const { count } = await prisma.guild.updateMany({
    where: { ...where, id: { in: expired.map((guild) => guild.id) } },
    data: { premiumTier: 'FREE' },
  });

  for (const guild of expired) {
    invalidateTierCache(guild.id);
  }

  console.log(`🧹 Premium reaper: downgraded ${count} guild(s) with an expired premiumTier to FREE`);

  return count;
}
