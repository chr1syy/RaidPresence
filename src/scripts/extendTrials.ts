/**
 * One-off data correction: moves running Premium trials onto the new TRIAL_DAYS length.
 *
 * WHY THIS EXISTS: `grantTrialIfEligible()` stamps `premiumExpiresAt` once, at grant
 * time, and only ever fires for guilds with `trialStartedAt = null`. Raising
 * `TRIAL_DAYS` from 14 to 30 therefore does nothing for the ~107 trials already
 * running — they keep the expiry that was written when they started. This script
 * rewrites those expiries.
 *
 * WHY IT IS NOT A MIGRATION: no schema changes, and it must not run automatically on
 * deploy. It is a deliberate, reviewed correction of production rows, executed by hand
 * after sign-off.
 *
 * WHY IT IS IDEMPOTENT: the new expiry is computed from `trialStartedAt`, never from
 * the current `premiumExpiresAt`. Running it twice recomputes the same instant, so the
 * second run reports zero changes instead of granting another 30 days.
 *
 * WHEN TO RUN IT: after a clean entitlement sync, in a quiet window. The paying-guild
 * guard below can only see entitlements the sync has already written locally, so a
 * payment that lands at Discord mid-run is not covered by it — see the note on the
 * updateMany WHERE clause. Waiting for a clean sync closes that window.
 *
 * Usage (dry-run is the default — nothing is written without --apply):
 *   npm run trials:extend
 *   npm run trials:extend -- --apply
 */
import prisma from '../database/client';
import { TRIAL_DAYS } from '../services/entitlementService';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TrialExtensionPlan {
  guildId: string;
  guildName: string;
  trialStartedAt: Date;
  from: Date | null;
  to: Date;
  /** True when this trial's *current* expiry is already in the past. */
  alreadyExpired: boolean;
}

export interface ExtendTrialsResult {
  /** Guilds matching the target predicate (real trials, no paid entitlement). */
  scanned: number;
  /** Guilds whose expiry differs from the recomputed one. */
  changed: number;
  /** Guilds already sitting on the correct expiry — the idempotent case. */
  unchanged: number;
  /** Subset of `changed` whose current expiry is already in the past. */
  expired: number;
  /** True when nothing was written. */
  dryRun: boolean;
  plans: TrialExtensionPlan[];
}

/**
 * Recomputes `premiumExpiresAt` as `trialStartedAt + TRIAL_DAYS` for every running trial.
 *
 * Target group, deliberately narrow:
 *   - `trialStartedAt != null` — the guild is on a trial at all.
 *   - `entitlementId = null` — never touch a paying guild. A paid subscription's expiry
 *     is owned by the entitlement sync; rewriting it from a trial start date would
 *     corrupt it. RaidPresence currently has exactly one such guild.
 *
 * Guilds whose trial has ALREADY EXPIRED are included on purpose. The decision: a guild
 * that started a trial 20 days ago was promised the trial length the product now
 * advertises, and 30 days from its start is still in the future, so it gets those days
 * back. A trial that started more than 30 days ago recomputes to a past expiry —
 * unchanged in effect, still expired, no resurrection. Either way the result is a pure
 * function of `trialStartedAt`, which is what keeps the script idempotent. As of
 * 2026-08-03 no trial has expired yet, but the script does not assume that.
 *
 * @param options.dryRun Defaults to true. Nothing is written unless this is explicitly false.
 */
export async function extendTrials(
  options: { dryRun?: boolean; now?: Date } = {},
): Promise<ExtendTrialsResult> {
  const dryRun = options.dryRun ?? true;
  const now = options.now ?? new Date();

  // Deliberately not filtered on `leftAt`: this is a one-off correction that already ran
  // on production, and it only rewrites `premiumExpiresAt` on rows that *already* hold a
  // trial. Skipping departed guilds would change nothing about the live install base but
  // would leave a re-installing guild sitting on the old, shorter expiry.
  const candidates = await prisma.guild.findMany({
    where: {
      trialStartedAt: { not: null },
      entitlementId: null,
    },
    select: {
      id: true,
      name: true,
      trialStartedAt: true,
      premiumExpiresAt: true,
    },
  });

  const plans: TrialExtensionPlan[] = [];
  let unchanged = 0;

  for (const guild of candidates) {
    // Narrowing only — the WHERE clause already excludes nulls.
    if (!guild.trialStartedAt) continue;

    const to = new Date(guild.trialStartedAt.getTime() + TRIAL_DAYS * DAY_MS);
    const from = guild.premiumExpiresAt;

    if (from && from.getTime() === to.getTime()) {
      unchanged++;
      continue;
    }

    plans.push({
      guildId: guild.id,
      guildName: guild.name,
      trialStartedAt: guild.trialStartedAt,
      from,
      to,
      alreadyExpired: from !== null && from < now,
    });
  }

  const expired = plans.filter((p) => p.alreadyExpired).length;

  console.log(
    `🎁 Trial extension (${TRIAL_DAYS}d): scanned=${candidates.length} ` +
      `changed=${plans.length} unchanged=${unchanged} alreadyExpired=${expired} dryRun=${dryRun}`,
  );

  for (const plan of plans) {
    console.log(
      `   ${plan.guildId} (${plan.guildName}): ` +
        `${plan.from ? plan.from.toISOString() : 'none'} -> ${plan.to.toISOString()}` +
        `${plan.alreadyExpired ? ' [was already expired]' : ''}`,
    );
  }

  if (dryRun) {
    console.log('🔍 Dry run — no rows were written. Re-run with --apply to persist.');
    return {
      scanned: candidates.length,
      changed: plans.length,
      unchanged,
      expired,
      dryRun: true,
      plans,
    };
  }

  for (const plan of plans) {
    // One update per guild rather than a bulk statement: each row gets a different
    // expiry, and a single failure must not take the rest of the batch with it. The
    // WHERE clause re-asserts the target predicate so a guild that started paying
    // between the scan and the write is skipped by the database, not just by us.
    // Note the limit of that guarantee: it holds against the *local* entitlement row,
    // i.e. once the sync has written `entitlementId` — not against the external payment
    // event that precedes it. A guild that pays at Discord mid-run still reads as a
    // trial here until the sync catches up. Hence the runbook rule: run this after a
    // clean entitlement sync, in a quiet window.
    const { count } = await prisma.guild.updateMany({
      where: { id: plan.guildId, trialStartedAt: { not: null }, entitlementId: null },
      data: { premiumExpiresAt: plan.to },
    });

    if (count === 0) {
      console.warn(`⚠️ Skipped ${plan.guildId}: no longer an eligible trial at write time`);
    }
  }

  console.log(`✅ Trial extension applied to ${plans.length} guild(s).`);

  return {
    scanned: candidates.length,
    changed: plans.length,
    unchanged,
    expired,
    dryRun: false,
    plans,
  };
}

if (require.main === module) {
  // Default to a dry run: this runs against production by hand, and the safe mode has
  // to be the one you get when you forget a flag.
  const apply = process.argv.includes('--apply');

  extendTrials({ dryRun: !apply })
    .catch((error) => {
      console.error('❌ Trial extension aborted:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
