import { Client, TextChannel, NewsChannel, EmbedBuilder } from 'discord.js';
import prisma from '../database/client';

/**
 * Archive-related search filter options.
 */
export interface ArchiveSearchFilter {
  query?: string; // Search by raid name or player participation
  startDate?: Date;
  endDate?: Date;
  guildId: string;
}

/**
 * Archive search result summary.
 */
export interface ArchiveRaidSummary {
  raidId: string;
  description: string | null;
  raidDate: Date;
  attendedCount: number;
  totalInvited: number;
  attendancePercent: number;
  participantNames: string[];
  archivedAt: Date;
  archiveChannelId: string | null;
}

/**
 * Archive a raid by moving it to an archive channel.
 * 
 * @param raidId - The raid to archive
 * @param guildId - The guild context
 * @param client - Discord.js client for message management
 * @returns Promise<string> - Archive message ID
 */
export async function archiveRaid(
  raidId: string,
  guildId: string,
  client: Client
): Promise<string> {
  // Fetch the guild to get archive channel
  const guild = await prisma.guild.findUnique({
    where: { id: guildId }
  });

  if (!guild || !guild.archiveChannelId) {
    throw new Error('Archive channel not configured for this guild. Use `/config archive-channel` first.');
  }

  // Fetch the raid with attendance
  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: {
      attendance: true
    }
  });

  if (!raid) {
    throw new Error(`Raid ${raidId} not found.`);
  }

  if (raid.guildId !== guildId) {
    throw new Error('Guild isolation violation: Cannot archive raid from different guild.');
  }

  // Get original channel and message
  const originalChannel = await client.channels.fetch(raid.channelId).catch(() => null);
  const archiveChannel = await client.channels.fetch(guild.archiveChannelId).catch(() => null);

  if (!archiveChannel || !(archiveChannel instanceof TextChannel || archiveChannel instanceof NewsChannel)) {
    throw new Error('Archive channel is invalid or not accessible.');
  }

  let originalMessage = null;
  if (raid.messageId && (originalChannel instanceof TextChannel || originalChannel instanceof NewsChannel)) {
    originalMessage = await originalChannel.messages.fetch(raid.messageId).catch(() => null);
  }

  // Create archive embed (simple summary)
  const archiveEmbed = new EmbedBuilder()
    .setColor(0x95a5a6) // Gray for archived
    .setTitle(`📦 Archived: ${raid.description || 'Raid'}`)
    .setDescription(`Raid from <t:${Math.floor(raid.raidDate.getTime() / 1000)}:F>`)
    .addFields(
      {
        name: 'Status',
        value: `${raid.status}`,
        inline: true
      },
       {
         name: 'Total Attendance',
         value: `${raid.attendance.filter(a => a.status === 'attending' || a.status === 'late').length}/${raid.attendance.length}`,
         inline: true
       }
    )
    .setFooter({ text: `Original Channel: ${raid.channelId}` })
    .setTimestamp(new Date());

  // Post to archive channel
  const archiveMessage = await archiveChannel.send({ embeds: [archiveEmbed] });

  // Update raid in database
  await prisma.raid.update({
    where: { id: raidId },
    data: {
      archivedAt: new Date(),
      archiveChannelId: guild.archiveChannelId,
      archiveMessageId: archiveMessage.id,
      isPinned: true
    }
  });

  // Delete from original channel if exists
  if (originalMessage) {
    try {
      await originalMessage.delete();
    } catch (err) {
      // Log but don't throw - archive is more important
      console.error(`Failed to delete original message: ${err}`);
    }
  }

  return archiveMessage.id;
}

/**
 * Restore (unarchive) a raid from archive channel back to original.
 * 
 * @param raidId - The raid to restore
 * @param guildId - The guild context
 * @param client - Discord.js client
 */
export async function unarchiveRaid(
  raidId: string,
  guildId: string,
  client: Client
): Promise<void> {
  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: {
      attendance: true
    }
  });

  if (!raid) {
    throw new Error(`Raid ${raidId} not found.`);
  }

  if (raid.guildId !== guildId) {
    throw new Error('Guild isolation violation: Cannot unarchive raid from different guild.');
  }

  if (!raid.isPinned) {
    throw new Error(`Raid ${raidId} is not archived.`);
  }

  // Get archive message
  let archiveMessage = null;
  if (raid.archiveChannelId && raid.archiveMessageId) {
    const archiveChannel = await client.channels.fetch(raid.archiveChannelId).catch(() => null);
     if (archiveChannel instanceof TextChannel || archiveChannel instanceof NewsChannel) {
       archiveMessage = await archiveChannel.messages.fetch(raid.archiveMessageId).catch(() => null);
     }
  }

  // Get original channel
  const originalChannel = await client.channels.fetch(raid.channelId).catch(() => null);
   if (!originalChannel || !(originalChannel instanceof TextChannel || originalChannel instanceof NewsChannel)) {
     throw new Error('Original channel is invalid or not accessible.');
   }

  // Create a basic notification that raid was restored
  const restoreEmbed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`✅ Raid Restored`)
    .setDescription(`${raid.description || 'Raid'} from <t:${Math.floor(raid.raidDate.getTime() / 1000)}:F>`)
    .setTimestamp(new Date());

  const newMessage = await originalChannel.send({ embeds: [restoreEmbed] });

  // Update raid in database
  await prisma.raid.update({
    where: { id: raidId },
    data: {
      archivedAt: null,
      archiveChannelId: null,
      archiveMessageId: null,
      isPinned: false,
      messageId: newMessage.id // Update to new message ID
    }
  });

  // Delete from archive
  if (archiveMessage) {
    try {
      await archiveMessage.delete();
    } catch (err) {
      console.error(`Failed to delete archive message: ${err}`);
    }
  }
}

/**
 * Retrieve the configured archive channel for a guild.
 * 
 * @param guildId - The guild
 * @param client - Discord.js client
 * @returns Promise<TextChannel | NewsChannel>
 */
export async function getArchiveChannel(
  guildId: string,
  client: Client
): Promise<TextChannel | NewsChannel> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId }
  });

  if (!guild || !guild.archiveChannelId) {
    throw new Error('Archive channel not configured. Use `/config archive-channel` first.');
  }

  const channel = await client.channels.fetch(guild.archiveChannelId).catch(() => null);
  if (!channel || !(channel instanceof TextChannel || channel instanceof NewsChannel)) {
    throw new Error('Archive channel is invalid or not accessible.');
  }

  return channel;
}

/**
 * Configure the archive channel for a guild.
 * 
 * @param guildId - The guild
 * @param channelId - The channel to set as archive
 * @param client - Discord.js client to verify channel exists
 */
export async function setupArchiveChannel(
  guildId: string,
  channelId: string,
  client: Client
): Promise<void> {
  // Verify channel exists and is accessible
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !(channel instanceof TextChannel || channel instanceof NewsChannel)) {
    throw new Error('Channel is invalid or not accessible.');
  }

  // Update guild config
  await prisma.guild.update({
    where: { id: guildId },
    data: {
      archiveChannelId: channelId
    }
  });
}

/**
 * Search archived raids in a guild with efficient database-level filtering.
 * Uses Prisma query layer to filter and paginate results, avoiding O(n) memory issues.
 * 
 * @param filters - Search filters including guildId, query, date range
 * @param pageSize - Number of results per page (default 25)
 * @returns Promise<ArchiveRaidSummary[]>
 */
export async function searchArchive(
  filters: ArchiveSearchFilter,
  pageSize: number = 25,
): Promise<ArchiveRaidSummary[]> {
  const { guildId, query, startDate, endDate } = filters;

  // Build where clause dynamically based on search parameters
  const where: any = {
    guildId,
    archivedAt: {
      not: null,
    },
  };

  // Add date range filter if provided
  if (startDate || endDate) {
    where.raidDate = {};
    if (startDate) {
      where.raidDate.gte = startDate;
    }
    if (endDate) {
      where.raidDate.lte = endDate;
    }
  }

  // Build text search filter if query provided
  // Note: This filters by raid description AND player name at the database level
  if (query && query.trim()) {
    where.OR = [
      {
        description: {
          contains: query,
          mode: 'insensitive',
        },
      },
      {
        attendance: {
          some: {
            username: {
              contains: query,
              mode: 'insensitive',
            },
          },
        },
      },
    ];
  }

  // Fetch archived raids with pagination
  // Select only needed fields for performance
  let raids = await prisma.raid.findMany({
    where,
    include: {
      attendance: {
        select: {
          username: true,
          status: true,
        },
      },
    },
    orderBy: {
      raidDate: 'desc',
    },
    take: pageSize,
  });

  // Transform to summaries
  return raids.map(raid => {
    const attendedCount = raid.attendance.filter(a => a.status === 'attending' || a.status === 'late').length;
    const totalInvited = raid.attendance.length;

    return {
      raidId: raid.id,
      description: raid.description,
      raidDate: raid.raidDate,
      attendedCount,
      totalInvited,
      attendancePercent: totalInvited > 0 ? Math.round((attendedCount / totalInvited) * 100) : 0,
      participantNames: raid.attendance
        .filter(a => a.status === 'attending' || a.status === 'late')
        .slice(0, 5)
        .map(a => a.username),
      archivedAt: raid.archivedAt!,
      archiveChannelId: raid.archiveChannelId
    };
  });
}

/**
 * Get archive stats for a guild (total archived, recent archives).
 */
export async function getArchiveStats(guildId: string) {
  const archived = await prisma.raid.findMany({
    where: {
      guildId,
      archivedAt: { not: null }
    }
  });

  const totalArchived = archived.length;
  const recentArchived = archived.filter(r => {
    const daysAgo = (Date.now() - r.archivedAt!.getTime()) / (1000 * 60 * 60 * 24);
    return daysAgo <= 30;
  }).length;

  return {
    totalArchived,
    recentArchived
  };
}
