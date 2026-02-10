import { Client } from 'discord.js';
import prisma from '../database/client';
import { createRaidEmbed } from '../commands/raid';
import { archiveRaid } from './archiveManager';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getTranslations } from './localization';
import { autoPurgeAllGuilds } from './raidPurger';
import { calculateRaidStats, getReliabilityScore } from './statsCalculator';
import { analyzeRaidComposition } from './compositionAnalyzer';
import { getBadges, getBadgeEmoji } from './badgeManager';
import { getBadgeName } from './badgeFormatter';

export function startRaidScheduler(client: Client) {
  // Check every 2 minutes for expired raids
  const CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes in milliseconds
  let lastPurgeTime = 0; // Timestamp of last auto-purge

  setInterval(async () => {
    try {
      await checkAndCloseExpiredRaids(client);
      
      // Run auto-purge daily (every 24 hours)
      const now = Date.now();
      if (now - lastPurgeTime > 24 * 60 * 60 * 1000) { // 24 hours
        await autoPurgeAllGuilds();
        lastPurgeTime = now;
      }
    } catch (error) {
      console.error('Error in raid scheduler:', error);
    }
  }, CHECK_INTERVAL);

  console.log('✅ Raid scheduler started - checking for expired raids every 2 minutes');
  console.log('✅ Auto-purge enabled - running daily cleanup of old raids');
}

async function postFeedbackMessage(raid: any, client: Client) {
  if (!raid.channelId) return;

  const channel = await client.channels.fetch(raid.channelId);
  if (!channel?.isTextBased() || !('send' in channel)) return;

  const trans = getTranslations(raid.guild.language || 'en');

  const embed = new EmbedBuilder()
    .setTitle(trans.raidFeedback)
    .setDescription(trans.howDidRaidGo)
    .setColor(0xffa500);

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`feedback_great_${raid.id}`)
      .setEmoji('😊')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`feedback_okay_${raid.id}`)
      .setEmoji('😐')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`feedback_bad_${raid.id}`)
      .setEmoji('😞')
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({
    embeds: [embed],
    components: [buttons],
  });
}

async function generateRaidSummaryEmbed(raidId: string, language: string): Promise<EmbedBuilder> {
  const trans = getTranslations(language);

  // Fetch raid with attendance
  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: {
      attendance: {
        include: {
          userPreference: true,
        },
      },
      guild: true,
    },
  });

  if (!raid) throw new Error('Raid not found');

  // Calculate attendance rate
  const totalRoster = raid.attendance.length;
  const attending = raid.attendance.filter(a => a.status === 'attending').length;
  const attendanceRate = totalRoster > 0 ? Math.round((attending / totalRoster) * 100) : 0;

  // Get composition analysis
  const compositionAttendees = raid.attendance.map(a => ({
    userId: a.userId,
    username: a.username,
    status: a.status,
    wowClass: (a.wowClass || a.userPreference?.wowClass) ?? null,
    wowSpec: (a.wowSpec || a.userPreference?.wowSpec) ?? null,
  }));
  const composition = analyzeRaidComposition(compositionAttendees);

  // Get raid stats
  const attendanceRecords = raid.attendance.map(a => ({
    userId: a.userId,
    username: a.username,
    status: a.status,
    wowClass: (a.wowClass || a.userPreference?.wowClass) ?? null,
    wowSpec: (a.wowSpec || a.userPreference?.wowSpec) ?? null,
  }));
  const stats = calculateRaidStats(attendanceRecords);

  // Get final roster
  const attendingPlayers = raid.attendance
    .filter(a => a.status === 'attending')
    .map(a => {
      const className = a.wowClass || a.userPreference?.wowClass || 'Unknown';
      const specName = a.wowSpec || a.userPreference?.wowSpec || '';
      const roleEmoji = getRoleEmoji(className, specName);
      return `${roleEmoji} ${a.username}`;
    })
    .join('\n');

  // Get badges earned during this raid
  const attendingUserIds = raid.attendance
    .filter(a => a.status === 'attending')
    .map(a => a.userId);
  const badgesEarned = [];
  for (const userId of attendingUserIds) {
    const userBadges = await getBadges(userId, raid.guildId);
    // Filter badges earned after raid date
    const recentBadges = userBadges.filter(b => b.earnedAt > raid.raidDate);
    if (recentBadges.length > 0) {
      badgesEarned.push(...recentBadges.map(b => ({
        playerName: raid.attendance.find(a => a.userId === userId)?.username || 'Unknown',
        badgeName: getBadgeName(b.badgeType, language),
        emoji: getBadgeEmoji(b.badgeType),
      })));
    }
  }

  // Build embed
  const embed = new EmbedBuilder()
    .setTitle('Raid Summary')
    .setDescription(`**${raid.description}**\n${raid.raidDate.toLocaleString(language)}`)
    .setColor(0x00ff00)
    .addFields(
      {
        name: 'Attendance',
        value: `${attending}/${totalRoster} (${attendanceRate}%)`,
        inline: true,
      },
      {
        name: 'Composition',
        value: `${stats.composition.tanks}T ${stats.composition.healers}H ${stats.composition.melee + stats.composition.ranged}D`,
        inline: true,
      },
      {
        name: 'Reliability',
        value: getReliabilityScore(stats.attendanceRate).label,
        inline: true,
      }
    );

  if (attendingPlayers) {
    embed.addFields({
      name: 'Final Roster',
      value: attendingPlayers.length > 1024 ? attendingPlayers.substring(0, 1021) + '...' : attendingPlayers,
      inline: false,
    });
  }

  if (badgesEarned.length > 0) {
    const badgeText = badgesEarned
      .map(b => `${b.emoji} ${b.playerName} - ${b.badgeName}`)
      .join('\n');
    embed.addFields({
      name: '🏆 Badges Earned',
      value: badgeText.length > 1024 ? badgeText.substring(0, 1021) + '...' : badgeText,
      inline: false,
    });
  }

  return embed;
}

// Helper function to get role emoji
function getRoleEmoji(wowClass: string, wowSpec: string): string {
  // Simplified, you can expand with actual WoW data
  if (wowSpec.toLowerCase().includes('tank')) return '🛡️';
  if (wowSpec.toLowerCase().includes('heal')) return '💚';
  return '⚔️';
}

export async function checkAndCloseExpiredRaids(client: Client) {
  const now = new Date();

  // Find all open raids that have expired
  const expiredRaids = await prisma.raid.findMany({
    where: {
      status: 'open',
      raidDate: {
        lt: now,
      },
    },
    include: {
      guild: true,
    },
  });

  if (expiredRaids.length === 0) return;

  console.log(`🕐 Found ${expiredRaids.length} expired raid(s) to close`);

   for (const raid of expiredRaids) {
     try {
       // Update raid status to closed
       await prisma.raid.update({
         where: { id: raid.id },
         data: { status: 'closed' },
       });

         // Check if auto-archive is enabled for this guild
         const shouldAutoArchive = !!(raid.guild.autoArchive && raid.guild.archiveChannelId);
         let archivedSuccessfully = false;

        // If auto-archive is enabled, archive the raid
        if (shouldAutoArchive) {
          try {
            await archiveRaid(raid.id, raid.guildId, client);
            archivedSuccessfully = true;
            console.log(`✅ Auto-archived raid: ${raid.description} (${raid.id})`);
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

               // Post raid summary
               if (channel?.isTextBased() && 'send' in channel) {
                 const summaryEmbed = await generateRaidSummaryEmbed(raid.id, raid.guild.language);
                 await channel.send({ embeds: [summaryEmbed] });
               }

               await postFeedbackMessage(raid, client);

              console.log(`✅ Auto-closed raid: ${raid.description} (${raid.id})`);
            }
          } catch (error) {
            console.error(`Error updating message for raid ${raid.id}:`, error);
          }
        } else if (archivedSuccessfully) {
          console.log(`✅ Auto-closed and archived raid: ${raid.description} (${raid.id})`);
        } else if (raid.messageId && raid.channelId) {
          // This case handles when shouldAutoArchive was false but we didn't have message to update
          console.log(`✅ Auto-closed raid (no message update needed): ${raid.description} (${raid.id})`);
        }
     } catch (error) {
       console.error(`Error closing raid ${raid.id}:`, error);
     }
   }
}
