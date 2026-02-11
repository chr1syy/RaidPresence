import { Client, TextChannel } from 'discord.js';
import { BadgeType } from '@prisma/client';
import prisma from '../database/client';
import { getTranslations } from './localization';
import { getBadgeName, getBadgeEmoji } from './badgeFormatter';

/**
 * Send a celebration message when a player earns a badge.
 * Posts to the raid channel if raidId is provided.
 *
 * @param client - Discord client
 * @param guildId - Guild ID
 * @param userId - User who earned the badge
 * @param badgeType - Type of badge earned
 * @param raidId - Optional raid ID to send to that channel
 */
export async function sendBadgeCelebration(
  client: Client,
  guildId: string,
  userId: string,
  badgeType: BadgeType,
  raidId?: string,
): Promise<void> {
  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) return;

    const member = await guild.members.fetch(userId);
    if (!member) return;

    // Get guild language
    const guildData = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { language: true },
    });
    const language = guildData?.language || 'en';
    const trans = getTranslations(language);

    // Get badge name and emoji
    const badgeName = getBadgeName(badgeType, language);
    const emoji = getBadgeEmoji(badgeType);

    // Build celebration message
    const message = trans.badgeEarned
      .replace('{playerName}', member.displayName)
      .replace('{badgeName}', `${emoji} ${badgeName}`);

    // Determine channel to send to
    let channel: TextChannel | null = null;

    if (raidId) {
      // Send to raid channel
      const raid = await prisma.raid.findUnique({
        where: { id: raidId },
        select: { channelId: true },
      });

      if (raid?.channelId) {
        const fetchedChannel = await client.channels.fetch(raid.channelId);
        if (fetchedChannel && fetchedChannel.isTextBased()) {
          channel = fetchedChannel as TextChannel;
        }
      }
    }

    // If no raid channel or no raidId, skip (for now; could add default channel later)
    if (!channel) return;

    // Send the message
    await channel.send(message);
  } catch (error) {
    // Log error but don't throw - badge awarding should not fail due to notification
    console.error('[BadgeNotifier] Failed to send celebration:', error);
  }
}