import { Client } from 'discord.js';
import prisma, { withRetry } from '../database/client';
import { createRaidEmbed } from '../commands/raid';
import { archiveRaid } from './archiveManager';
import { getTeamLabel } from './teamContext';
import { FEATURE_TIERS, getTier, hasFeature } from '../services/entitlementService';
import { advanceSeries, retireNudge, sendPostRaidNudge } from '../services/recurringRaidService';
import { NUDGE_LOOKBACK_MS, NUDGE_TTL_MS, RECURRENCE_WEEKLY } from './recurrence';

/**
 * Upper bound per pass. The scheduler runs every two minutes; a backlog is worked off
 * over several ticks rather than in one burst that would hit Discord's rate limits.
 */
const BATCH_LIMIT = 25;

/**
 * Formats a raid's team for the scheduler's log output.
 *
 * `getTeamLabel` already returns `null` for single-team guilds, so their log lines stay
 * byte-for-byte identical to the pre-multi-team wording. Plain text, no markdown — these
 * end up in the operator console, not in a Discord message.
 */
function teamSuffix(label: string | null): string {
  return label ? ` (Team: ${label})` : '';
}

/**
 * Starts a background scheduler that automatically closes expired raids.
 * 
 * This function sets up an interval that checks every 2 minutes for raids that have passed
 * their scheduled date and are still marked as 'open'. When expired raids are found, they are
 * automatically closed, their status updated in the database, and their Discord messages are
 * updated to remove interactive buttons.
 * 
 * Parameters:
 *   - client: Client - The Discord.js client instance used to update raid messages
 * 
 * Returns:
 *   void - This function starts the scheduler but does not return a value
 * 
 * Example:
 *   // Start the scheduler when the bot initializes
 *   startRaidScheduler(client);
 */
export function startRaidScheduler(client: Client) {
  const CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes in milliseconds

  setInterval(async () => {
    try {
      await checkAndCloseExpiredRaids(client);
    } catch (error) {
      console.error('Error in raid scheduler:', error);
    }

    // Deliberately separate passes rather than work tacked onto the close loop: each one
    // re-reads its own state from the database, so a crash anywhere leaves a state the
    // next tick can pick up from. That is what makes the successor creation idempotent.
    try {
      await processRecurringSeries(client);
    } catch (error) {
      console.error('Error in recurring raid pass:', error);
    }

    try {
      await sendPostRaidNudges(client);
    } catch (error) {
      console.error('Error in post-raid nudge pass:', error);
    }

    try {
      await expireStaleNudges(client);
    } catch (error) {
      console.error('Error in nudge expiry pass:', error);
    }
  }, CHECK_INTERVAL);

  console.log('✅ Raid scheduler started - checking for expired raids every 2 minutes');
}

export async function checkAndCloseExpiredRaids(client: Client) {
  const now = new Date();

  // Find all open raids that have expired.
  // Deliberately NOT scoped by team: auto-close and auto-archive are background maintenance
  // and must cover every team of every guild. Adding a `teamId` filter here would silently
  // leave the raids of all non-default teams open forever.
  const expiredRaids = await withRetry(() =>
    prisma.raid.findMany({
      where: {
        status: 'open',
        raidDate: {
          lt: now,
        },
      },
      include: {
        guild: true,
      },
    }),
  );

  if (expiredRaids.length === 0) return;

  console.log(`🕐 Found ${expiredRaids.length} expired raid(s) to close`);

   for (const raid of expiredRaids) {
     try {
       // Update raid status to closed
       await withRetry(() =>
         prisma.raid.update({
           where: { id: raid.id },
           data: { status: 'closed' },
         }),
       );

       // Name the team in the log lines below, but only when the guild actually has more
       // than one — resolved once per raid so a multi-team guild pays a single lookup.
       const teamLabel = teamSuffix(await getTeamLabel(raid.guildId, raid.teamId));

         // Check if auto-archive is enabled for this guild
         const autoArchiveConfigured = !!(raid.guild.autoArchive && raid.guild.archiveChannelId);

         // Auto-archive is the background twin of `/raid archive`, so it has to honour the
         // same `raid.archive` entitlement. Without this check a guild whose trial lapsed
         // keeps archiving forever and never sees the upsell the manual paths show.
         // Skipped quietly on purpose: there is no interaction to reply to here, and a
         // scheduler pass must not message the guild every two minutes. The raid still
         // closes normally below — only the archiving is withheld.
         let shouldAutoArchive = autoArchiveConfigured;
         if (autoArchiveConfigured) {
           try {
             const tier = await getTier(raid.guildId);
             if (!hasFeature(tier, 'raid.archive')) {
               shouldAutoArchive = false;
               console.log(
                 `⏭️ Skipped auto-archive for raid ${raid.id} — guild ${raid.guildId} is on ${tier}, 'raid.archive' requires ${FEATURE_TIERS['raid.archive']}`,
               );
             }
           } catch (tierError) {
             // Fail closed: an unreadable tier must not hand out a premium feature. The
             // raid still closes; the next pass re-evaluates once the lookup recovers.
             shouldAutoArchive = false;
             console.error(`⚠️ Tier lookup failed for guild ${raid.guildId}, skipping auto-archive:`, tierError);
           }
         }

         let archivedSuccessfully = false;

        // If auto-archive is enabled, archive the raid
        if (shouldAutoArchive) {
          try {
            await archiveRaid(raid.id, raid.guildId, client);
            archivedSuccessfully = true;
            console.log(`✅ Auto-archived raid: ${raid.description} (${raid.id})${teamLabel}`);
          } catch (archiveError) {
            console.error(`⚠️ Failed to auto-archive raid ${raid.id}:`, archiveError);
            // Continue with regular closure even if archiving fails
          }
        }

        // Update the raid message if it exists (for non-archived raids or if archiving failed)
        if (!archivedSuccessfully && raid.messageId && raid.channelId) {
         try {
           const channel = await client.channels.fetch(raid.channelId);
           if (channel?.isTextBased() && 'messages' in channel) {
             const message = await channel.messages.fetch(raid.messageId);
             const embed = await createRaidEmbed(raid.id, raid.guild.language);

             // Remove buttons when closed
             await message.edit({
               embeds: [embed],
               components: [],
             });

              console.log(`✅ Auto-closed raid: ${raid.description} (${raid.id})${teamLabel}`);
            }
          } catch (error) {
            console.error(`Error updating message for raid ${raid.id}:`, error);
          }
        } else if (archivedSuccessfully) {
          console.log(`✅ Auto-closed and archived raid: ${raid.description} (${raid.id})${teamLabel}`);
        } else if (raid.messageId && raid.channelId) {
          // This case handles when shouldAutoArchive was false but we didn't have message to update
          console.log(`✅ Auto-closed raid (no message update needed): ${raid.description} (${raid.id})${teamLabel}`);
        }
     } catch (error) {
       console.error(`Error closing raid ${raid.id}:`, error);
     }
   }
}

/**
 * Creates the next instance of every active weekly series whose current instance is over.
 *
 * Runs as its own pass instead of inside the close loop on purpose. The query is
 * "closed series raid that has no successor yet", which is exactly the state a crash
 * between closing and generating leaves behind — so the retry is the normal path, not a
 * special case, and the UNIQUE index on `recurrenceParentId` makes a double run a no-op.
 */
export async function processRecurringSeries(client: Client) {
  const now = new Date();

  const due = await withRetry(() =>
    prisma.raid.findMany({
      where: {
        status: 'closed',
        recurrenceRule: RECURRENCE_WEEKLY,
        recurrenceActive: true,
        raidDate: { lt: now },
        // The successor slot is empty — the whole idempotency guard in one clause.
        recurrenceChild: { is: null },
      },
      orderBy: { raidDate: 'asc' },
      take: BATCH_LIMIT,
    }),
  );

  if (due.length === 0) return;

  console.log(`🔁 Advancing ${due.length} recurring raid series`);

  for (const raid of due) {
    try {
      await advanceSeries(client, raid);
    } catch (error) {
      console.error(`Error advancing recurring series for raid ${raid.id}:`, error);
    }
  }
}

/**
 * Posts the "same time next week?" prompt under recently closed one-off raids.
 *
 * The lookback window matters: without it, the first tick after deploy would nudge every
 * raid ever closed. Cancelled raids and raids that are part of a series are excluded —
 * the series already produces next week, and nobody wants a nudge for a raid they called
 * off.
 */
export async function sendPostRaidNudges(client: Client) {
  const now = new Date();

  const candidates = await withRetry(() =>
    prisma.raid.findMany({
      where: {
        status: 'closed',
        nudgeSentAt: null,
        recurrenceRule: null,
        recurrenceChild: { is: null },
        raidDate: { lt: now, gt: new Date(now.getTime() - NUDGE_LOOKBACK_MS) },
      },
      orderBy: { raidDate: 'asc' },
      take: BATCH_LIMIT,
    }),
  );

  if (candidates.length === 0) return;

  for (const raid of candidates) {
    try {
      await sendPostRaidNudge(client, raid);
    } catch (error) {
      console.error(`Error sending post-raid nudge for raid ${raid.id}:`, error);
    }
  }
}

/** Removes nudge buttons nobody pressed within {@link NUDGE_TTL_MS}. */
export async function expireStaleNudges(client: Client) {
  const cutoff = new Date(Date.now() - NUDGE_TTL_MS);

  const stale = await withRetry(() =>
    prisma.raid.findMany({
      where: {
        nudgeMessageId: { not: null },
        nudgeSentAt: { lt: cutoff },
      },
      take: BATCH_LIMIT,
    }),
  );

  for (const raid of stale) {
    try {
      await retireNudge(client, raid);
    } catch (error) {
      console.error(`Error expiring nudge for raid ${raid.id}:`, error);
    }
  }
}
