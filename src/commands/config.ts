import {
  SlashCommandBuilder,
  CommandInteraction,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import prisma from '../database/client';
import { Command } from '../types';
import { VERSION } from '../utils/version';
import { freeTierHint } from '../middleware/premiumGate';
import {
  DEFAULT_TIMEZONE,
  formatTimezoneLabel,
  guildTimezoneUpdate,
  normalizeTimezone,
  searchTimezones,
} from '../utils/timezoneHelper';

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
        .setDescription('Set the timezone raid times are entered in')
        .addStringOption((option) =>
          option
            .setName('zone')
            .setDescription('IANA timezone, e.g. Europe/Berlin — start typing a city to search')
            .setRequired(true)
            .setAutocomplete(true)
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

/**
 * Renders `raidLeaderRoles` for `/config view`.
 *
 * The column holds names *or* IDs. Since #48 the welcome setup chain writes IDs
 * (that is what a `RoleSelectMenu` yields), so a raw dump would show a row of
 * meaningless numbers — snowflakes are rendered as role mentions instead, names
 * stay in code ticks.
 */
export function formatLeaderRoles(raw: string | null): string {
  const entries = cleanLeaderRoles(raw || '');
  if (!entries) return '`Not configured (uses ManageEvents permission)`';

  return entries
    .split(',')
    .map((entry) => (/^\d{17,20}$/.test(entry) ? `<@&${entry}>` : `\`${entry}\``))
    .join(' ');
}

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

  const leaderRoles = formatLeaderRoles(guildData.raidLeaderRoles);
  const language = guildData.language === 'de' ? 'Deutsch (German)' : 'English';
  const timezone = guildData.timezone || DEFAULT_TIMEZONE;
  const timezoneDisplay = formatTimezoneLabel(timezone);
  const archiveChannel = guildData.archiveChannelId ? `<#${guildData.archiveChannelId}>` : 'Not configured';
  const autoArchiveStatus = guildData.autoArchive ? '✅ Enabled' : '❌ Disabled';

  const embed = new EmbedBuilder()
    .setTitle('Server Configuration')
    .setColor(0x00ae86)
    .addFields(
      {
        name: 'Raid Leader Roles',
        value: `${leaderRoles}\n\nMembers with these roles can create and delete raids.`,
        inline: false,
      },
      {
        name: 'Language',
        value: `\`${language}\`\n\nBot messages will appear in this language.`,
        inline: false,
      },
      {
        name: 'Timezone',
        value: `\`${timezoneDisplay}\`\n\nTimes you type in \`/raid create\` are read as local time in this zone. Daylight saving is applied automatically.`,
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
    .setFooter({ text: `Use /config to update any setting | v${VERSION}` })
    .setTimestamp();

  const hint = await freeTierHint(interaction.guildId, guildData.language || 'en');
  await interaction.editReply({ embeds: [embed], content: hint || undefined });
}

/**
 * Normalises the comma-separated `raidLeaderRoles` column value.
 *
 * Entries may be role IDs or role names — `canManageRaids` matches either — so this
 * only trims and drops empties. Returns `''` when nothing usable is left, which the
 * callers treat as "reject" rather than "clear".
 */
export function cleanLeaderRoles(input: string): string {
  return input
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .join(',');
}

/**
 * The single write path for `Guild.raidLeaderRoles`.
 *
 * Shared with the welcome setup chain (#48) so the column has exactly one writer;
 * the welcome flow can be triggered from a DM, where the guild name is only
 * available from the client cache, hence the explicit `guildName` parameter.
 */
export async function setLeaderRoles(
  guildId: string,
  guildName: string,
  cleanedRoles: string
): Promise<void> {
  await prisma.guild.upsert({
    where: { id: guildId },
    update: { raidLeaderRoles: cleanedRoles },
    create: {
      id: guildId,
      name: guildName,
      raidLeaderRoles: cleanedRoles,
    },
  });
}

/** The single write path for `Guild.language`. Shared with the welcome chain (#48). */
export async function setLanguage(
  guildId: string,
  guildName: string,
  language: 'en' | 'de'
): Promise<void> {
  await prisma.guild.upsert({
    where: { id: guildId },
    update: { language },
    create: {
      id: guildId,
      name: guildName,
      raidLeaderRoles: '',
      language,
    },
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
  const cleanedRoles = cleanLeaderRoles(roles);

  if (!cleanedRoles) {
    await interaction.editReply({
      content: '❌ Invalid roles format. Please provide role names or IDs separated by commas.',
    });
    return;
  }

  await setLeaderRoles(interaction.guild.id, interaction.guild.name, cleanedRoles);

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

  await setLanguage(interaction.guild.id, interaction.guild.name, language);

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

  const rawZone = interaction.options.get('zone', true).value as string;

  // Autocomplete is a suggestion, not a constraint — Discord submits whatever the
  // user typed, so the value has to be validated here regardless.
  const timezone = normalizeTimezone(rawZone);

  if (!timezone) {
    await interaction.editReply({
      content:
        `❌ \`${rawZone}\` is not a known timezone.\n\n` +
        'Pick one from the autocomplete list, or pass an IANA identifier such as ' +
        '`Europe/Berlin`, `America/New_York` or `UTC`.',
    });
    return;
  }

  // Update in database. `guildTimezoneUpdate` also fills the deprecated
  // `timezoneOffset` column, which phase 1 of the IANA migration keeps around as a
  // rollback path — see prisma/migrations/20260803090000_guild_timezone_iana_phase1.
  const timezoneData = guildTimezoneUpdate(timezone);

  await prisma.guild.upsert({
    where: { id: interaction.guild.id },
    update: timezoneData,
    create: {
      id: interaction.guild.id,
      name: interaction.guild.name,
      raidLeaderRoles: '',
      language: 'en',
      ...timezoneData,
    },
  });

  await interaction.editReply({
    content:
      `✅ Timezone updated to: \`${formatTimezoneLabel(timezone)}\`\n\n` +
      'Times you type in `/raid create` are now read as local time in this zone, ' +
      'with daylight saving applied automatically.',
  });
}

/**
 * Autocomplete for `/config timezone zone:` — filters the common-zone list.
 *
 * Registered from the interaction dispatcher in `index.ts` alongside the shared
 * `team` autocomplete.
 */
export async function timezoneAutocomplete(
  interaction: AutocompleteInteraction
): Promise<void> {
  const focused = interaction.options.getFocused();
  const matches = searchTimezones(focused);

  await interaction.respond(
    matches.map((zone) => ({ name: formatTimezoneLabel(zone), value: zone }))
  );
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
    content: `✅ Archive channel set to <#${channel.id}>.\n\nClosed raids can now be archived to this channel using \`/raid archive\`.`,
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
