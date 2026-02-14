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

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View attendance and raid statistics')
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
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents) as SlashCommandBuilder,

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'raid') {
      await handleRaidStats(interaction);
    } else if (subcommand === 'guild') {
      await handleGuildStats(interaction);
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

export default command;