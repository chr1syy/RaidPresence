import {
  SlashCommandBuilder,
  CommandInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import prisma from '../database/client';
import { Command } from '../types';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure bot settings for this server')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('view')
        .setDescription('View current server configuration')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('raid-roles')
        .setDescription('Set roles that are automatically added to raids')
        .addStringOption((option) =>
          option
            .setName('roles')
            .setDescription('Role names or IDs (comma-separated, e.g., "Raider,Member")')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('leader-roles')
        .setDescription('Set roles that can create and manage raids')
        .addStringOption((option) =>
          option
            .setName('roles')
            .setDescription('Role names or IDs (comma-separated, e.g., "Officer,Raid Leader")')
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as SlashCommandBuilder,

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'view') {
      await handleViewConfig(interaction);
    } else if (subcommand === 'raid-roles') {
      await handleSetRaidRoles(interaction);
    } else if (subcommand === 'leader-roles') {
      await handleSetLeaderRoles(interaction);
    }
  },
};

async function handleViewConfig(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  if (!guildData) {
    await interaction.editReply({
      content: '❌ Server configuration not found. Please try again.',
    });
    return;
  }

  const raidRoles = guildData.raidRoles || 'Not configured';
  const leaderRoles = guildData.raidLeaderRoles || 'Not configured (uses ManageEvents permission)';

  const embed = new EmbedBuilder()
    .setTitle('Server Configuration')
    .setColor(0x00ae86)
    .addFields(
      {
        name: 'Raid Attendance Roles',
        value: `\`${raidRoles}\`\n\nMembers with these roles are automatically added to raid rosters.`,
        inline: false,
      },
      {
        name: 'Raid Leader Roles',
        value: `\`${leaderRoles}\`\n\nMembers with these roles can create and delete raids.`,
        inline: false,
      }
    )
    .setFooter({ text: 'Use /config raid-roles or /config leader-roles to update' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleSetRaidRoles(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const roles = interaction.options.get('roles', true).value as string;

  // Validate and clean up the roles string
  const cleanedRoles = roles
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .join(',');

  if (!cleanedRoles) {
    await interaction.editReply({
      content: '❌ Invalid roles format. Please provide role names or IDs separated by commas.',
    });
    return;
  }

  // Update in database
  await prisma.guild.upsert({
    where: { id: interaction.guild.id },
    update: { raidRoles: cleanedRoles },
    create: {
      id: interaction.guild.id,
      name: interaction.guild.name,
      raidRoles: cleanedRoles,
      raidLeaderRoles: '',
    },
  });

  await interaction.editReply({
    content: `✅ Raid attendance roles updated to: \`${cleanedRoles}\`\n\nMembers with these roles will be automatically added to future raids.`,
  });
}

async function handleSetLeaderRoles(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const roles = interaction.options.get('roles', true).value as string;

  // Validate and clean up the roles string
  const cleanedRoles = roles
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .join(',');

  if (!cleanedRoles) {
    await interaction.editReply({
      content: '❌ Invalid roles format. Please provide role names or IDs separated by commas.',
    });
    return;
  }

  // Update in database
  await prisma.guild.upsert({
    where: { id: interaction.guild.id },
    update: { raidLeaderRoles: cleanedRoles },
    create: {
      id: interaction.guild.id,
      name: interaction.guild.name,
      raidRoles: '',
      raidLeaderRoles: cleanedRoles,
    },
  });

  await interaction.editReply({
    content: `✅ Raid leader roles updated to: \`${cleanedRoles}\`\n\nMembers with these roles can now create and manage raids.`,
  });
}

export default command;
