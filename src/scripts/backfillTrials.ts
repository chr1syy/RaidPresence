/**
 * One-off backfill that starts the Premium trial for guilds that predate it.
 *
 * WHY THIS EXISTS: `grantTrialIfEligible()` was only ever wired into the `guildCreate`
 * event handler, and only since v0.5.0. Every guild that installed the bot before that
 * release never fired the event on an eligible code path, so their `trialStartedAt` is
 * still NULL and they never received the trial they were entitled to.
 *
 * WHY IT IS IDEMPOTENT: this module does not reimplement the grant. It only pre-selects
 * likely candidates to cut down on write attempts and then delegates every actual
 * decision to `grantTrialIfEligible()`, whose eligibility predicate (`trialStartedAt`
 * null, `entitlementId` null, `premiumTier` FREE) lives inside the WHERE clause of a
 * single atomic `updateMany`. A second run therefore matches zero rows and reports
 * `granted: false`; guilds with a paid entitlement or a non-FREE tier are never touched,
 * and existing trials are never extended.
 */
import prisma from '../database/client';
import { grantTrialIfEligible } from '../services/entitlementService';

/** How many guilds are processed concurrently — small on purpose, this is a rare batch job. */
const BATCH_SIZE = 5;

export interface BackfillTrialsResult {
  scanned: number;
  granted: number;
  skipped: number;
}

/**
 * Grants the one-time Premium trial to every legacy guild that is still eligible.
 *
 * @param options.dryRun When true, only the candidate query runs — no grants are attempted.
 */
export async function backfillTrials(
  options: { dryRun?: boolean } = {},
): Promise<BackfillTrialsResult> {
  const dryRun = options.dryRun ?? false;

  // Pre-selection only: this narrows the write attempts. The authoritative eligibility
  // check still happens atomically inside grantTrialIfEligible().
  const candidates = await prisma.guild.findMany({
    where: {
      trialStartedAt: null,
      entitlementId: null,
      premiumTier: 'FREE',
    },
    select: { id: true, name: true },
  });

  const scanned = candidates.length;

  if (dryRun) {
    console.log(`🎁 Trial backfill: scanned=${scanned} granted=0 skipped=0 (dryRun=true)`);
    if (scanned > 0) {
      console.log(`🎁 Trial backfill candidates: ${candidates.map((g) => g.id).join(', ')}`);
    }
    return { scanned, granted: 0, skipped: 0 };
  }

  let granted = 0;
  let skipped = 0;

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (guild) => {
        try {
          const result = await grantTrialIfEligible(guild.id);
          return result.granted;
        } catch (error) {
          // A single failing guild must not abort the whole backfill.
          console.error(`❌ Trial backfill failed for guild ${guild.id} (${guild.name}):`, error);
          return false;
        }
      }),
    );

    for (const wasGranted of results) {
      if (wasGranted) {
        granted++;
      } else {
        skipped++;
      }
    }
  }

  console.log(`🎁 Trial backfill: scanned=${scanned} granted=${granted} skipped=${skipped} (dryRun=false)`);

  return { scanned, granted, skipped };
}

/**
 * Startup wrapper around {@link backfillTrials} with the entitlement-sync guard.
 *
 * `syncEntitlementsOnStartup()` swallows its own errors, so a (partially) failed sync is
 * indistinguishable from a clean one at the call site unless its result is inspected.
 * That matters here: the backfill's candidate query treats a NULL `entitlementId` as
 * "never paid". A guild that IS paying but whose entitlement failed to write would be
 * picked up as a FREE candidate and handed a trial over its paid tier. So we only run
 * when the sync completed cleanly; otherwise we skip and let the next boot retry, which
 * is safe because the backfill is idempotent.
 *
 * Never throws — startup must continue regardless.
 *
 * @returns the backfill result, or `null` when the backfill was skipped or failed.
 */
export async function runStartupTrialBackfill(
  entitlementSync: { ok: boolean },
): Promise<BackfillTrialsResult | null> {
  if (!entitlementSync.ok) {
    console.warn('⏭️ Trial backfill skipped: entitlement sync did not complete cleanly');
    return null;
  }

  try {
    return await backfillTrials();
  } catch (error) {
    console.error('❌ Trial backfill failed:', error);
    return null;
  }
}

if (require.main === module) {
  backfillTrials({ dryRun: process.argv.includes('--dry-run') })
    .then((result) => {
      console.log(`✅ Trial backfill finished: ${JSON.stringify(result)}`);
    })
    .catch((error) => {
      console.error('❌ Trial backfill aborted:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
