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
        .setName('leader-roles')
        .setDescription('Set roles that can create and manage raids')
        .addStringOption((option) =>
          option
            .setName('roles')
            .setDescription('Role names or IDs (comma-separated, e.g., "Officer,Raid Leader")')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('language')
        .setDescription('Set the bot language for this server')
        .addStringOption((option) =>
          option
            .setName('lang')
            .setDescription('Choose a language')
            .setRequired(true)
            .addChoices(
              { name: 'English', value: 'en' },
              { name: 'Deutsch (German)', value: 'de' }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('timezone')
        .setDescription('Set the timezone offset for raid times')
        .addIntegerOption((option) =>
          option
            .setName('offset')
            .setDescription('Timezone offset in hours (e.g., 1 for GMT+1, -5 for GMT-5)')
            .setRequired(true)
            .setMinValue(-12)
            .setMaxValue(14)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('archive-channel')
        .setDescription('Set the archive channel for closed raids')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('The channel to use for raid archives')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('auto-archive')
        .setDescription('Automatically archive raids when they close')
        .addBooleanOption((option) =>
          option
            .setName('enabled')
            .setDescription('Enable auto-archive on raid close?')
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as SlashCommandBuilder,

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'view') {
      await handleViewConfig(interaction);
    } else if (subcommand === 'leader-roles') {
      await handleSetLeaderRoles(interaction);
    } else if (subcommand === 'language') {
      await handleSetLanguage(interaction);
    } else if (subcommand === 'timezone') {
      await handleSetTimezone(interaction);
    } else if (subcommand === 'archive-channel') {
      await handleSetArchiveChannel(interaction);
    } else if (subcommand === 'auto-archive') {
      await handleSetAutoArchive(interaction);
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

  const leaderRoles = guildData.raidLeaderRoles || 'Not configured (uses ManageEvents permission)';
  const language = guildData.language === 'de' ? 'Deutsch (German)' : 'English';
  const timezoneOffset = guildData.timezoneOffset;
  const timezoneDisplay = timezoneOffset >= 0 ? `GMT+${timezoneOffset}` : `GMT${timezoneOffset}`;
  const archiveChannel = guildData.archiveChannelId ? `<#${guildData.archiveChannelId}>` : 'Not configured';
  const autoArchiveStatus = guildData.autoArchive ? '✅ Enabled' : '❌ Disabled';

  const embed = new EmbedBuilder()
    .setTitle('Server Configuration')
    .setColor(0x00ae86)
    .addFields(
      {
        name: 'Raid Leader Roles',
        value: `\`${leaderRoles}\`\n\nMembers with these roles can create and delete raids.`,
        inline: false,
      },
      {
        name: 'Language',
        value: `\`${language}\`\n\nBot messages will appear in this language.`,
        inline: false,
      },
      {
        name: 'Timezone',
        value: `\`${timezoneDisplay}\`\n\nRaid times will be created in this timezone.`,
        inline: false,
      },
      {
        name: '📦 Archive Channel',
        value: `${archiveChannel}\n\nClosed raids can be archived to this channel.`,
        inline: false,
      },
      {
        name: '📦 Auto-Archive',
        value: `${autoArchiveStatus}\n\nRaids are ${guildData.autoArchive ? 'automatically' : 'manually'} archived when they close.`,
        inline: false,
      }
    )
    .setFooter({ text: 'Use /config to update any setting' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
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
      raidLeaderRoles: cleanedRoles,
    },
  });

  await interaction.editReply({
    content: `✅ Raid leader roles updated to: \`${cleanedRoles}\`\n\nMembers with these roles can now create and manage raids.`,
  });
}

async function handleSetLanguage(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const language = interaction.options.get('lang', true).value as string;

  if (language !== 'en' && language !== 'de') {
    await interaction.editReply({
      content: '❌ Invalid language. Please choose English or German.',
    });
    return;
  }

  // Update in database
  await prisma.guild.upsert({
    where: { id: interaction.guild.id },
    update: { language },
    create: {
      id: interaction.guild.id,
      name: interaction.guild.name,
      raidLeaderRoles: '',
      language,
    },
  });

  const languageName = language === 'de' ? 'Deutsch (German)' : 'English';
  await interaction.editReply({
    content: `✅ Language updated to: \`${languageName}\`\n\nBot messages will now appear in this language.`,
  });
}

async function handleSetTimezone(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const offset = interaction.options.get('offset', true).value as number;

  if (offset < -12 || offset > 14) {
    await interaction.editReply({
      content: '❌ Invalid timezone offset. Must be between -12 and +14.',
    });
    return;
  }

  // Update in database
  await prisma.guild.upsert({
    where: { id: interaction.guild.id },
    update: { timezoneOffset: offset },
    create: {
      id: interaction.guild.id,
      name: interaction.guild.name,
      raidLeaderRoles: '',
      language: 'en',
      timezoneOffset: offset,
    },
  });

   const timezoneDisplay = offset >= 0 ? `GMT+${offset}` : `GMT${offset}`;
   await interaction.editReply({
     content: `✅ Timezone updated to: \`${timezoneDisplay}\`\n\nRaid times will now be created in this timezone.`,
   });
}

async function handleSetArchiveChannel(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.options.getChannel('channel', true);

  // Verify the channel is text-based
  const { ChannelType } = await import('discord.js');
  const isTextChannel = channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;

  if (!isTextChannel) {
    await interaction.editReply({
      content: '❌ Archive channel must be a text channel.',
    });
    return;
  }

  // Update in database
  await prisma.guild.upsert({
    where: { id: interaction.guild.id },
    update: { archiveChannelId: channel.id },
    create: {
      id: interaction.guild.id,
      name: interaction.guild.name,
      raidLeaderRoles: '',
      archiveChannelId: channel.id,
    },
  });

  await interaction.editReply({
    content: `✅ Archive channel set to <#${channel.id}>.\n\nClosed raids can now be archived to this channel using \`/stats archive\`.`,
  });
}

async function handleSetAutoArchive(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const enabled = interaction.options.getBoolean('enabled', true);

  // First, check if an archive channel is configured (required for auto-archive)
  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  if (enabled && !guildData?.archiveChannelId) {
    await interaction.editReply({
      content: '❌ Archive channel must be configured before enabling auto-archive.\n\nUse `/config archive-channel` to set it up first.',
    });
    return;
  }

  // Update in database
  await prisma.guild.upsert({
    where: { id: interaction.guild.id },
    update: { autoArchive: enabled },
    create: {
      id: interaction.guild.id,
      name: interaction.guild.name,
      raidLeaderRoles: '',
      autoArchive: enabled,
    },
  });

  await interaction.editReply({
    content: `Auto-archive is now ${enabled ? 'enabled' : 'disabled'}. ${enabled ? 'Raids will automatically be archived when they close.' : ''}`,
  });
}

export default command;
