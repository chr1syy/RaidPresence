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
import { analyzeRaidComposition, findCompositionGaps, suggestPlayerSwaps, calculateSuccessLikelihood } from '../utils/compositionAnalyzer';
import { formatCompositionEmbed } from '../utils/compositionFormatter';
import { gateFeature } from '../middleware/premiumGate';
import { getTier, hasFeature } from '../services/entitlementService';
import { t } from '../utils/localization';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View raid statistics, attendance, and composition analysis')
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
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents) as SlashCommandBuilder,

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

  // Premium gate: analytics
  if (!(await gateFeature(interaction, 'stats.analytics', guildData.language || 'en'))) return;

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
    case 'quarter':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
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

  const lang = guildData.language || 'en';
  const tier = await getTier(interaction.guild.id);
  const hasFullHistory = hasFeature(tier, 'stats.full_history');

  const playerStats = await calculatePlayerStats(player.id, interaction.guild.id, period);
  const roleDistribution = await getPlayerRoleDistribution(player.id, interaction.guild.id);
  let history = await getPlayerAttendanceHistory(player.id, interaction.guild.id, period);

  // Cap history for free tier
  const FREE_HISTORY_LIMIT = 10;
  const wasCapped = !hasFullHistory && history.length > FREE_HISTORY_LIMIT;
  if (wasCapped) {
    history = history.slice(0, FREE_HISTORY_LIMIT);
  }

  const embed = formatAttendanceEmbed(player.displayName || player.username || 'Unknown', playerStats, roleDistribution, history, period, lang);

  if (wasCapped) {
    const upsell = t(lang, 'premiumAttendanceCapped', { count: FREE_HISTORY_LIMIT });
    embed.setFooter({ text: upsell });
  }

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

  // Premium gate: analytics
  if (!(await gateFeature(interaction, 'stats.analytics', raid.guild.language || 'en'))) return;

  const composition = await analyzeRaidComposition(raid.attendance);
  const gaps = findCompositionGaps(raid.attendance);
  const suggestions = suggestPlayerSwaps(raid.attendance, gaps);
  const likelihood = calculateSuccessLikelihood(raid.attendance);

  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  const embed = formatCompositionEmbed(raid.description || 'Raid', composition, gaps, suggestions, likelihood, guildData?.language || 'en');

  await interaction.editReply({ embeds: [embed] });
}

export default command;
