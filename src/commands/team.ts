import {
  SlashCommandBuilder,
  CommandInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import prisma from '../database/client';
import { Command } from '../types';
import { VERSION } from '../utils/version';
import { t } from '../utils/localization';
import { gateFeature, freeTierHint } from '../middleware/premiumGate';
import { canCreateAdditionalTeam, teamLimitFor } from '../services/entitlementService';
import {
  countTeams,
  createTeamWithinLimit,
  deleteTeam,
  getTeamByName,
  listTeams,
  DuplicateTeamNameError,
  TeamLimitReachedError,
} from '../services/teamService';

/** Discord option limit we mirror for team names. */
const MAX_TEAM_NAME_LENGTH = 50;

/**
 * Cascade warning appended to the delete confirmation.
 * Kept local (not in `Translations`) because it is specific to this one response.
 */
const DELETE_CASCADE_NOTE: Record<string, string> = {
  en: 'All raids of this team were deleted as well.',
  de: 'Alle Raids dieses Teams wurden ebenfalls gelöscht.',
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('Manage raid teams for this server')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Create a new team')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Name of the new team (max 50 characters)')
            .setRequired(true)
            .setMaxLength(MAX_TEAM_NAME_LENGTH)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('list').setDescription('List all teams of this server')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete a team and all of its raids')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Name of the team to delete')
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as SlashCommandBuilder,

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      await handleCreateTeam(interaction);
    } else if (subcommand === 'list') {
      await handleListTeams(interaction);
    } else if (subcommand === 'delete') {
      await handleDeleteTeam(interaction);
    }
  },
};

/** Guild language, defaulting to English when the guild has no record yet. */
async function getGuildLanguage(guildId: string): Promise<string> {
  const guildData = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { language: true },
  });
  return guildData?.language || 'en';
}

async function handleCreateTeam(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guild.id;
  const lang = await getGuildLanguage(guildId);
  const name = interaction.options.getString('name', true).trim();

  if (!name || name.length > MAX_TEAM_NAME_LENGTH) {
    await interaction.reply({ content: t(lang, 'teamInvalidName'), ephemeral: true });
    return;
  }

  // Gate before deferring so gateFeature can reply with the upsell embed directly.
  const currentCount = await countTeams(guildId);
  if (!(await canCreateAdditionalTeam(guildId, currentCount))) {
    await gateFeature(interaction, 'team.multi', lang);
    return;
  }

  // The pre-check above is only the fast path for the common case; the limit itself is
  // enforced inside the create transaction, so two parallel calls can never both pass.
  const maxTeams = await teamLimitFor(guildId);

  await interaction.deferReply({ ephemeral: true });

  try {
    const team = await createTeamWithinLimit(guildId, name, interaction.user.id, maxTeams);
    await interaction.editReply({ content: t(lang, 'teamCreated', { name: team.name }) });
  } catch (error) {
    if (error instanceof DuplicateTeamNameError) {
      await interaction.editReply({ content: t(lang, 'teamAlreadyExists', { name }) });
      return;
    }
    if (error instanceof TeamLimitReachedError) {
      // Lost the race against a concurrent create: same friendly upsell, never a raw DB error.
      await gateFeature(interaction, 'team.multi', lang);
      return;
    }
    throw error;
  }
}

async function handleListTeams(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guild.id;
  const lang = await getGuildLanguage(guildId);

  await interaction.deferReply({ ephemeral: true });

  const teams = await listTeams(guildId);

  const lines = await Promise.all(
    teams.map(async (team) => {
      const raidCount = await prisma.raid.count({ where: { teamId: team.id } });
      const entry = t(lang, 'teamListEntry', { name: team.name, count: raidCount });
      return team.isDefault ? `${entry} _(${t(lang, 'teamDefaultBadge')})_` : entry;
    })
  );

  const embed = new EmbedBuilder()
    .setTitle(t(lang, 'teamListTitle'))
    .setColor(0x00ae86)
    .setDescription(lines.length > 0 ? lines.join('\n') : t(lang, 'teamListEmpty'))
    .setFooter({ text: `RaidPresence • v${VERSION}` })
    .setTimestamp();

  // Free guilds get the shared low-key upgrade nudge; premium replies stay unchanged.
  const hint = await freeTierHint(interaction.guildId, lang);

  await interaction.editReply({ embeds: [embed], ...(hint ? { content: hint } : {}) });
}

async function handleDeleteTeam(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guild.id;
  const lang = await getGuildLanguage(guildId);
  const name = interaction.options.getString('name', true).trim();

  await interaction.deferReply({ ephemeral: true });

  const team = await getTeamByName(guildId, name);

  if (!team) {
    await interaction.editReply({ content: t(lang, 'teamNotFound', { name }) });
    return;
  }

  if (team.isDefault) {
    await interaction.editReply({ content: t(lang, 'teamCannotDeleteDefault') });
    return;
  }

  await deleteTeam(team.id);

  await interaction.editReply({
    content: `${t(lang, 'teamDeleted', { name: team.name })}\n${DELETE_CASCADE_NOTE[lang] || DELETE_CASCADE_NOTE.en}`,
  });
}

export default command;
