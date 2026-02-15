import {
  SlashCommandBuilder,
  CommandInteraction,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import prisma from '../database/client';
import { Command } from '../types';
import { calculateRaidStats, calculateGuildStats } from '../utils/statsCalculator';
import { formatRaidStatsEmbed, formatGuildStatsEmbed } from '../utils/statsFormatter';
import { formatStatusEmbed } from '../utils/statusFormatter';
import { calculatePlayerStats, getPlayerRoleDistribution, getPlayerAttendanceHistory } from '../utils/attendanceAnalytics';
import { formatAttendanceEmbed } from '../utils/attendanceFormatter';
import { analyzeRaidComposition, findCompositionGaps, suggestPlayerSwaps, calculateSuccessLikelihood, CompositionAttendee } from '../utils/compositionAnalyzer';
import { formatCompositionEmbed } from '../utils/compositionFormatter';
import { formatRaidNotesEmbed } from '../utils/notesFormatter';
import { archiveRaid, unarchiveRaid, searchArchive } from '../utils/archiveManager';
import { formatArchiveSearchEmbed } from '../utils/archiveFormatter';
import { canManageRaids } from '../utils/permissions';
import { getTranslations } from '../utils/localization';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Manage raid statistics, attendance, and archives')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('raid')
        .setDescription('View statistics for a specific raid')
        .addStringOption((option) =>
          option
            .setName('raid_id')
            .setDescription('The ID of the raid')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('period')
            .setDescription('Time period: week, month, all')
            .addChoices(
              { name: 'Last 7 days', value: 'week' },
              { name: 'Last 30 days', value: 'month' },
              { name: 'All time', value: 'all' }
            )
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('guild')
        .setDescription('View guild-wide attendance statistics')
        .addStringOption((option) =>
          option
            .setName('period')
            .setDescription('Time period to analyze')
            .addChoices(
              { name: 'Last 7 days', value: 'week' },
              { name: 'Last 30 days', value: 'month' },
              { name: 'All time', value: 'all' }
            )
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('View all upcoming raids at a glance')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('attendance')
        .setDescription('View a player\'s attendance history and reliability')
        .addUserOption((option) =>
          option
            .setName('player')
            .setDescription('The player to check')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('period')
            .setDescription('Time period to analyze')
            .addChoices(
              { name: 'Last 30 days', value: 'month' },
              { name: 'Last 90 days', value: 'quarter' },
              { name: 'All time', value: 'all' }
            )
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('suggest')
        .setDescription('Get composition suggestions for a raid')
        .addStringOption((option) =>
          option
            .setName('raid_id')
            .setDescription('The raid to analyze')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('notes')
        .setDescription('View raid notes and opt-out reasons')
        .addStringOption((option) =>
          option
            .setName('raid_id')
            .setDescription('The ID of the raid')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('archive')
        .setDescription('Archive a raid to keep history clean')
        .addStringOption((option) =>
          option
            .setName('raid_id')
            .setDescription('The raid to archive')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unarchive')
        .setDescription('Restore an archived raid')
        .addStringOption((option) =>
          option
            .setName('raid_id')
            .setDescription('The raid to restore')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('search')
        .setDescription('Search archived raids')
        .addStringOption((option) =>
          option
            .setName('query')
            .setDescription('Search query (raid name, player, date)')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('period')
            .setDescription('Time period to search')
            .addChoices(
              { name: 'Last 30 days', value: 'month' },
              { name: 'Last 90 days', value: 'quarter' },
              { name: 'All time', value: 'all' }
            )
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(0 as any) as any,

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'raid') {
      await handleRaidStats(interaction);
    } else if (subcommand === 'guild') {
      await handleGuildStats(interaction);
    } else if (subcommand === 'status') {
      await handleStatusCommand(interaction);
    } else if (subcommand === 'attendance') {
      await handleAttendanceCommand(interaction);
    } else if (subcommand === 'suggest') {
      await handleSuggestCommand(interaction);
    } else if (subcommand === 'notes') {
      await handleNotesCommand(interaction);
    } else if (subcommand === 'archive') {
      await handleArchiveCommand(interaction);
    } else if (subcommand === 'unarchive') {
      await handleUnarchiveCommand(interaction);
    } else if (subcommand === 'search') {
      await handleSearchCommand(interaction);
    }
  },
};

async function handleRaidStats(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const raidId = interaction.options.get('raid_id', true).value as string;

  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: { attendance: true, guild: true },
  });

  if (!raid) {
    await interaction.editReply({
      content: '❌ Raid not found.',
    });
    return;
  }

  if (raid.guildId !== interaction.guild.id) {
    await interaction.editReply({
      content: '❌ This raid does not belong to this server.',
    });
    return;
  }

  const stats = calculateRaidStats(raid.attendance);
  const raidInfo = { id: raid.id, description: raid.description };
  const embed = formatRaidStatsEmbed(raidInfo, stats, raid.guild.language || 'en');

  await interaction.editReply({ embeds: [embed] });
}

async function handleGuildStats(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const period = interaction.options.get('period', false)?.value as string || 'month';

  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  if (!guildData) {
    await interaction.editReply({
      content: '❌ Guild not found in database.',
    });
    return;
  }

  const startDate = getStartDate(period);
  const raids = await prisma.raid.findMany({
    where: {
      guildId: interaction.guild.id,
      raidDate: { gte: startDate },
    },
    include: { attendance: true },
  });

  const stats = calculateGuildStats(raids);
  const embed = formatGuildStatsEmbed(stats, period, guildData.language || 'en');

  await interaction.editReply({ embeds: [embed] });
}

function getStartDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'all':
      return new Date(0);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

async function handleStatusCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const now = new Date();
  const raids = await prisma.raid.findMany({
    where: {
      guildId: interaction.guild.id,
      status: 'open',
      raidDate: {
        gte: now,
      },
    },
    orderBy: {
      raidDate: 'asc',
    },
    take: 7,
    include: {
      attendance: true,
    },
  });

  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  const embed = formatStatusEmbed(raids, guildData?.language || 'en');

  await interaction.editReply({ embeds: [embed] });
}

async function handleAttendanceCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const player = interaction.options.get('player', true).user!;
  const period = interaction.options.get('period', false)?.value as string || 'month';

  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  if (!guildData) {
    await interaction.editReply({
      content: '❌ Guild not found in database.',
    });
    return;
  }

  const startDate = getStartDate(period);
  const playerStats = await calculatePlayerStats(player.id, interaction.guild.id, period);
  const roleDistribution = await getPlayerRoleDistribution(player.id, interaction.guild.id);
  const history = await getPlayerAttendanceHistory(player.id, interaction.guild.id, period);

  const embed = formatAttendanceEmbed(player.displayName, playerStats, roleDistribution, history, period, guildData.language || 'en');

  await interaction.editReply({ embeds: [embed] });
}

async function handleSuggestCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const raidId = interaction.options.get('raid_id', true).value as string;

  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: { attendance: true, guild: true },
  });

  if (!raid) {
    await interaction.editReply({
      content: '❌ Raid not found.',
    });
    return;
  }

  if (raid.guildId !== interaction.guild.id) {
    await interaction.editReply({
      content: '❌ This raid does not belong to this server.',
    });
    return;
  }

  const composition = await analyzeRaidComposition(raid.attendance);
  const gaps = findCompositionGaps(raid.attendance);
  const suggestions = suggestPlayerSwaps(raid.attendance, gaps);
  const likelihood = calculateSuccessLikelihood(raid.attendance);

  const embed = formatCompositionEmbed(raid.description || 'Raid', composition, gaps, suggestions, likelihood, raid.guild.language || 'en');

  await interaction.editReply({ embeds: [embed] });
}

async function handleNotesCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const raidId = interaction.options.get('raid_id', true).value as string;

  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: { attendance: true, guild: true },
  });

  if (!raid) {
    await interaction.editReply({
      content: '❌ Raid not found.',
    });
    return;
  }

  if (raid.guildId !== interaction.guild.id) {
    await interaction.editReply({
      content: '❌ This raid does not belong to this server.',
    });
    return;
  }

  const raidName = raid.description || `Raid on ${raid.raidDate.toLocaleDateString(raid.guild.language || 'en')}`;
  const notes = raid.attendance
    .filter((a) => a.optoutReason || a.playerNote)
    .map((a) => ({
      username: a.username,
      optoutReason: a.optoutReason || undefined,
      playerNote: a.playerNote || undefined,
      status: a.status,
      notedAt: a.notedAt || undefined,
    }));

  const embed = formatRaidNotesEmbed(raidName, raid.raidDate, notes, raid.guild.language || 'en');

  await interaction.editReply({ embeds: [embed] });
}

async function handleArchiveCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // Check permissions
  const member = interaction.member;
  if (!member || !(await canManageRaids(member as any))) {
    await interaction.editReply({
      content: '❌ You do not have permission to archive raids. Ask your server admin to configure raid leader roles.',
    });
    return;
  }

  const raidId = interaction.options.get('raid_id', true).value as string;

  const trans = getTranslations('en'); // or from guild

  try {
    await archiveRaid(raidId, interaction.guild.id, interaction.client);
    await interaction.editReply({
      content: trans.raidArchivedSuccess || 'Raid archived successfully.',
    });
  } catch (error) {
    console.error('Error archiving raid:', error);
    await interaction.editReply({
      content: '❌ Failed to archive raid.',
    });
  }
}

async function handleUnarchiveCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // Check permissions
  const member = interaction.member;
  if (!member || !(await canManageRaids(member as any))) {
    await interaction.editReply({
      content: '❌ You do not have permission to restore raids. Ask your server admin to configure raid leader roles.',
    });
    return;
  }

  const raidId = interaction.options.get('raid_id', true).value as string;

  const trans = getTranslations('en');

  try {
    await unarchiveRaid(raidId, interaction.guild.id, interaction.client);
    await interaction.editReply({
      content: trans.raidRestoredSuccess || 'Raid restored successfully.',
    });
  } catch (error) {
    console.error('Error restoring raid:', error);
    await interaction.editReply({
      content: '❌ Failed to restore raid.',
    });
  }
}

async function handleSearchCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const query = interaction.options.get('query', true).value as string;
  const period = interaction.options.get('period', false)?.value as string || 'month';

  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  const startDate = getStartDate(period);

  const results = await searchArchive({ guildId: interaction.guild.id, query: query || undefined, startDate });

  const embed = formatArchiveSearchEmbed(results, query, period, guildData?.language || 'en');

  await interaction.editReply({ embeds: [embed] });
}

export default command;