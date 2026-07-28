import {
  SlashCommandBuilder,
  CommandInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Guild,
} from 'discord.js';
import prisma from '../database/client';
import { Command } from '../types';
import { getSpecRole, getSpecSymbol, RoleComposition } from '../utils/wowData';
import { canManageRaids } from '../utils/permissions';
import { t, getTranslations } from '../utils/localization';
import { VERSION } from '../utils/version';
import { archiveRaid, unarchiveRaid, searchArchive } from '../utils/archiveManager';
import { formatArchiveSearchEmbed } from '../utils/archiveFormatter';
import { isRateLimitError, handleRateLimitError, fetchMembersWithRateLimitHandling } from '../utils/rateLimitHandler';
import { tryConsumeWeeklyRaid } from '../services/entitlementService';
import { gateFeature, premiumFooterHint, freeTierHint } from '../middleware/premiumGate';
import { getEffectivePrefsMap, normalizeRoleIds } from '../utils/rolePreference';
import { addTeamOption, getTeamLabel, resolveTeam, TEAM_OPTION_NAME } from '../utils/teamContext';
import { countTeams } from '../services/teamService';

/**
 * Suffix that names the raid's team in a confirmation message.
 *
 * The raid-ID based subcommands (`delete`, `close`, `open`, `cancel`, `remind`, `refresh`)
 * take no `team` option — the ID already pins the team — but on multi-team guilds the
 * leader needs to see which team they just touched. `getTeamLabel()` returns `null` for
 * single-team guilds, so their wording is unchanged.
 * @param label Team name from {@link getTeamLabel}, or `null`
 */
function teamSuffix(label: string | null): string {
  return label ? ` (Team: **${label}**)` : '';
}

/**
 * Resolve the guild's default ("Main") team, creating it lazily for guilds that
 * predate the multi-team migration or were onboarded without one.
 *
 * `raid create`, `raid list` and `raid clone` resolve their team via `resolveTeam()` from
 * `src/utils/teamContext.ts`. This fallback remains only for `clone` without an explicit
 * `team` option, where the source raid may predate the migration and carry no `teamId`.
 * @param guildId Discord guild ID
 * @returns The default team's ID
 */
async function resolveDefaultTeamId(guildId: string): Promise<string> {
  const existing = await prisma.team.findFirst({
    where: { guildId, isDefault: true },
  });
  if (existing) return existing.id;

  const created = await prisma.team.create({
    data: { guildId, name: 'Main', isDefault: true, createdBy: 'system' },
  });
  return created.id;
}

/**
 * Build role mentions from role IDs or names
 * @param guild Discord guild instance
 * @param roleIds Array of role IDs (snowflake strings) or exact role names (case-sensitive)
 * @returns Space-separated string of role mentions (e.g., "<@&123> <@&456>"). 
 *          Returns empty string if no valid roles are found. 
 *          Invalid roles are logged as warnings and excluded from the result.
 */
function buildRoleMentions(guild: Guild, roleIds: string[]): string {
  const roleMentions = roleIds
    .map((roleIdOrName) => {
      const trimmed = roleIdOrName.trim();
      if (!trimmed) return null;
      
      // Try to find role by ID first (exact match), then by name (exact match)
      const role = guild.roles.cache.get(trimmed) ||
                   guild.roles.cache.find(r => r.name === trimmed);
      
      if (!role) {
        console.warn(`Role not found: ${trimmed}`);
        return null;
      }
      
      return `<@&${role.id}>`;
    })
    .filter((mention) => mention !== null)
    .join(' ');

  return roleMentions;
}

/**
 * Parse role input string into array of role IDs
 * Supports @role mentions, role IDs, and role names
 * @param input The input string
 * @param guild Discord guild instance
 * @returns Object with valid role IDs and invalid role names
 */
function parseRoleInput(input: string, guild: Guild): { validIds: string[]; invalidNames: string[] } {
  const roleIds: string[] = [];
  const invalidNames: string[] = [];

  // Parse @role mentions
  const mentionRegex = /<@&(\d+)>/g;
  let match;
  while ((match = mentionRegex.exec(input)) !== null) {
    roleIds.push(match[1]);
  }

  // Parse comma-separated parts
  const parts = input.replace(mentionRegex, '').split(',').map(r => r.trim()).filter(Boolean);
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      roleIds.push(part);
    } else {
      const role = guild.roles.cache.find(r => r.name === part);
      if (role) {
        roleIds.push(role.id);
      } else {
        invalidNames.push(part);
      }
    }
  }

  return { validIds: [...new Set(roleIds)], invalidNames };
}

/**
 * Main raid command with multiple subcommands for managing Discord raid events.
 * 
 * Provides comprehensive raid management functionality including creating, listing,
 * editing, closing, cancelling, and refreshing raids. Supports role-based permissions
 * and multilingual responses.
 * 
 * Subcommands:
 *   - create: Creates a new raid event with role-based member selection
 *   - list: Shows all upcoming raids with attendance counts
 *   - edit: Modifies raid date, time, or title (raid leaders only)
 *   - delete: Permanently removes a raid and its message
 *   - close: Closes a raid to prevent further changes
 *   - cancel: Cancels a raid event
 *   - remind: Sends a reminder message to raid participants
 *   - refresh: Updates roster and embed with current member status
 *   - clone: Clones an existing raid to create a new one
 * 
 * Parameters:
 *   - Various subcommand options: Subcommands have their own parameter sets including raid_id, date, time, title, roles, etc.
 * 
 * Returns:
 *   Command - Discord slash command object implementing the Command interface
 * 
 * Errors/Exceptions:
 *   - PermissionError: When user lacks raid management permissions
 *   - ValidationError: When required parameters are missing or invalid
 *   - NotFoundError: When specified raid does not exist
 *   - GuildError: When command used outside a server context
 * 
 * Example:
 *   /raid create date:2025-12-25 time:19:30 title:"Naxxramas 25" roles:@Tank,@Healer ping_roles:true
 *   /raid list
 *   /raid edit raid_id:abc123 title:"Updated Title"
 */
const command: Command = {
  // No setDefaultMemberPermissions here on purpose: authorization is enforced at
  // runtime via canManageRaids (src/utils/permissions.ts). Raid leader roles live
  // in the database (/config leader-roles), which setDefaultMemberPermissions
  // cannot express - it would hide /raid from exactly those roles an admin just
  // granted access to.
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Manage raid events')
    .addSubcommand((subcommand) =>
      addTeamOption(
        subcommand
          .setName('create')
          .setDescription('Create a new raid event')
          .addStringOption((option) =>
            option
              .setName('date')
              .setDescription('Raid date (YYYY-MM-DD)')
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName('time')
              .setDescription('Raid time (HH:MM in 24h format)')
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName('title')
              .setDescription('Raid title/name')
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName('roles')
              .setDescription('Discord roles for this raid (@role mentions or comma-separated names/IDs)')
              .setRequired(true)
          )
          .addBooleanOption((option) =>
            option
              .setName('ping_roles')
              .setDescription('Ping the specified roles when creating the raid')
              .setRequired(false)
          )
      )
    )
    .addSubcommand((subcommand) =>
      addTeamOption(
        subcommand
          .setName('list')
          .setDescription('List all upcoming raids')
      )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete a raid event')
        .addStringOption((option) =>
          option
            .setName('raid_id')
            .setDescription('The ID of the raid to delete')
            .setRequired(true)
        )
    )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('close')
          .setDescription('Close a raid event')
          .addStringOption((option) =>
            option
              .setName('raid_id')
              .setDescription('The ID of the raid to close')
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('open')
          .setDescription('Reopen a closed raid to allow changes')
          .addStringOption((option) =>
            option
              .setName('raid_id')
              .setDescription('The ID of the raid to reopen')
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('cancel')
          .setDescription('Cancel a raid event')
          .addStringOption((option) =>
            option
              .setName('raid_id')
              .setDescription('The ID of the raid to cancel')
              .setRequired(true)
          )
      )
     .addSubcommand((subcommand) =>
       subcommand
         .setName('remind')
         .setDescription('Send a reminder for a raid')
         .addStringOption((option) =>
           option
             .setName('raid_id')
             .setDescription('The ID of the raid to remind about')
             .setRequired(true)
         )
         .addStringOption((option) =>
           option
             .setName('message')
             .setDescription('Custom message to include in reminder (optional)')
             .setRequired(false)
         )
     )
     .addSubcommand((subcommand) =>
       subcommand
         .setName('refresh')
         .setDescription('Refresh raid roster and embed (add new members, remove ineligible, update design)')
         .addStringOption((option) =>
           option
             .setName('raid_id')
             .setDescription('The ID of the raid to refresh')
             .setRequired(true)
         )
     )
     .addSubcommand((subcommand) =>
       subcommand
         .setName('edit')
         .setDescription('Edit a raid event (date, time, title)')
         .addStringOption((option) =>
           option
             .setName('raid_id')
             .setDescription('The ID of the raid to edit')
             .setRequired(true)
         )
         .addStringOption((option) =>
           option
             .setName('date')
             .setDescription('New raid date (YYYY-MM-DD format)')
             .setRequired(false)
         )
         .addStringOption((option) =>
           option
             .setName('time')
             .setDescription('New raid time (HH:MM 24h format)')
             .setRequired(false)
         )
      .addStringOption((option) =>
        option
          .setName('title')
          .setDescription('New raid title')
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName('status')
          .setDescription('New raid status')
          .setRequired(false)
          .addChoices(
            { name: 'Open', value: 'open' },
            { name: 'Closed', value: 'closed' },
            { name: 'Cancelled', value: 'cancelled' },
          )
      )
     )
     .addSubcommand((subcommand) =>
       addTeamOption(
         subcommand
           .setName('clone')
           .setDescription('Clone an existing raid to create a new one')
           .addStringOption((option) =>
             option
               .setName('raid_id')
               .setDescription('The ID of the raid to clone')
               .setRequired(true)
           )
           .addStringOption((option) =>
             option
               .setName('date')
               .setDescription('New raid date (YYYY-MM-DD)')
               .setRequired(true)
           )
           .addStringOption((option) =>
             option
               .setName('time')
               .setDescription('New raid time (HH:MM in 24h format)')
               .setRequired(false)
           )
           .addStringOption((option) =>
             option
               .setName('title')
               .setDescription('New raid title (optional, defaults to original)')
               .setRequired(false)
           )
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
        addTeamOption(
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
      ) as SlashCommandBuilder,

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      await handleCreateRaid(interaction);
    } else if (subcommand === 'list') {
      await handleListRaids(interaction);
    } else if (subcommand === 'delete') {
      await handleDeleteRaid(interaction);
    } else if (subcommand === 'close') {
      await handleCloseRaid(interaction);
    } else if (subcommand === 'open') {
      await handleOpenRaid(interaction);
    } else if (subcommand === 'cancel') {
      await handleCancelRaid(interaction);
    } else if (subcommand === 'remind') {
        await handleRemindRaid(interaction);
    } else if (subcommand === 'refresh') {
        await handleRefreshRaid(interaction);
    } else if (subcommand === 'edit') {
        await handleEditRaid(interaction);
     } else if (subcommand === 'clone') {
         await handleCloneRaid(interaction);
    } else if (subcommand === 'archive') {
      await handleArchiveRaid(interaction);
    } else if (subcommand === 'unarchive') {
      await handleUnarchiveRaid(interaction);
    } else if (subcommand === 'search') {
      await handleSearchArchive(interaction);
    }
  }
};

async function handleCreateRaid(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !interaction.channel) {
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
      content: '❌ You do not have permission to create raids. Ask your server admin to configure raid leader roles.',
    });
    return;
  }

  const dateStr = interaction.options.get('date', true).value as string;
  const timeStr = interaction.options.get('time', true).value as string;
  const title = interaction.options.get('title', true).value as string;
  const rolesInput = interaction.options.get('roles', true).value as string;
  const pingRoles = interaction.options.get('ping_roles', false)?.value as boolean ?? false;

  // Get guild settings first for timezone and default roles
  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  if (!guildData) {
    await interaction.editReply({
      content: '❌ Guild not found in database. Please try again.',
    });
    return;
  }

  // Use the specified roles
  const effectiveRolesInput = rolesInput;
  
  if (!effectiveRolesInput || effectiveRolesInput.trim() === '') {
    await interaction.editReply({
      content: '❌ Raid roles must be specified in the command.',
    });
    return;
  }

  // Parse and validate date/time with timezone offset
  const dateTimeStr = `${dateStr}T${timeStr}:00`;
  const localDate = new Date(dateTimeStr);

  // Apply timezone offset (user enters local time, we store UTC)
  const timezoneOffsetHours = guildData.timezoneOffset || 0;
  const raidDate = new Date(localDate.getTime() - (timezoneOffsetHours * 60 * 60 * 1000));

  if (isNaN(raidDate.getTime())) {
    await interaction.editReply({
      content: '❌ Invalid date or time format. Use YYYY-MM-DD for date and HH:MM for time.',
    });
    return;
  }

  if (raidDate < new Date()) {
    await interaction.editReply({
      content: '❌ Raid date must be in the future!',
    });
    return;
  }

  // Get members with raid roles
  const { validIds: roleIds, invalidNames } = parseRoleInput(effectiveRolesInput, interaction.guild);

  if (invalidNames.length > 0) {
    const invalidList = invalidNames.join(', ');
    if (roleIds.length === 0) {
      await interaction.editReply({
        content: `❌ No valid roles provided. The following roles were not found: ${invalidList}`,
      });
      return;
    } else {
      // Warn user about invalid roles but proceed with valid ones
      await interaction.editReply({
        content: `⚠️ These roles were not found: ${invalidList}. Proceeding with available roles.`,
      });
    }
  }

  if (roleIds.length === 0) {
    await interaction.editReply({
      content: '❌ No valid roles provided. Please specify at least one valid role in the command.',
    });
    return;
  }

  let eligibleMembers = new Set<string>();

  // Fetch all members if not cached
  try {
    await interaction.guild.members.fetch();
  } catch (error) {
    if (isRateLimitError(error)) {
      await handleRateLimitError(error, interaction, guildData.language || 'en');
      return;
    }
    throw error;
  }

  for (const [memberId, member] of interaction.guild.members.cache) {
    if (member.user.bot) continue;

    const hasRaidRole = member.roles.cache.some((role) =>
      roleIds.includes(role.id) || roleIds.includes(role.name)
    );

    if (hasRaidRole) {
      eligibleMembers.add(memberId);
    }
  }

  if (eligibleMembers.size === 0) {
    await interaction.editReply({
      content: `❌ No eligible members found with roles: ${effectiveRolesInput}. Verify that members have these roles (use role names or IDs, separated by commas).`,
    });
    return;
  }

  // Ensure all eligible members have UserPreference records (required for foreign key)
  for (const userId of eligibleMembers) {
    const member = interaction.guild.members.cache.get(userId);
    if (member) {
      await prisma.userPreference.upsert({
        where: {
          userId_guildId: {
            userId,
            guildId: interaction.guild.id,
          },
        },
        update: {
          username: member.displayName,
        },
        create: {
          userId,
          guildId: interaction.guild.id,
          username: member.displayName,
        },
      });
    }
  }

  // Get user preferences for class/spec (role-specific preferred over global)
  const memberRolesMap = new Map<string, string[]>();
  for (const userId of eligibleMembers) {
    const member = interaction.guild.members.cache.get(userId);
    if (member) {
      memberRolesMap.set(userId, Array.from(member.roles.cache.values()).map(r => r.id));
    }
  }
  const prefsMap = await getEffectivePrefsMap(
    Array.from(eligibleMembers),
    interaction.guild.id,
    roleIds,
    memberRolesMap,
  );

  // Resolve the target team before the weekly limit is consumed — an unknown team name is
  // an input error and must not burn a raid slot.
  const teamOption = interaction.options.get(TEAM_OPTION_NAME, false)?.value as string | undefined;
  const { team, error: teamError } = await resolveTeam(interaction.guild.id, teamOption ?? null);
  if (teamError === 'not_found') {
    await interaction.editReply({
      content: t(guildData.language || 'en', 'teamNotFound', { name: teamOption ?? '' }),
    });
    return;
  }

  // Check weekly raid limit (free tier: 5/week) — after all validation so we don't waste a slot on invalid input.
  // Deliberately guild-wide, not per team: extra teams are a premium convenience and must not
  // multiply the FREE tier's weekly raid allowance.
  const { allowed, max, resetAt } = await tryConsumeWeeklyRaid(interaction.guild.id);
  if (!allowed) {
    const lang = guildData.language || 'en';
    const localeMap: Record<string, string> = { en: 'en-US', de: 'de-DE' };
    const resetDate = resetAt
      ? resetAt.toLocaleString(localeMap[lang] || 'en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    await interaction.editReply({
      content: `${t(lang, 'premiumWeeklyLimitReached', { count: String(max), max: String(max), resetDate })}\n${premiumFooterHint(lang)}`,
    });
    return;
  }

  // Create raid in database
  const raid = await prisma.raid.create({
    data: {
      guildId: interaction.guild.id,
      teamId: team.id,
      channelId: interaction.channel.id,
      raidDate,
      description: title,
      roles: roleIds.join(','),
      createdBy: interaction.user.id,
    },
  });

  // Create attendance records for all eligible members with their saved class/spec
  const attendanceData = Array.from(eligibleMembers).map((userId) => {
    const member = interaction.guild!.members.cache.get(userId);
    const pref = prefsMap.get(userId);
    return {
      raidId: raid.id,
      // Denormalised from the raid we just created — read from the resolved team rather
      // than the create result so it is never undefined.
      teamId: team.id,
      userId,
      guildId: interaction.guild!.id,
      username: member?.displayName || 'Unknown',
      status: 'attending' as const,
      wowClass: pref?.wowClass || null,
      wowSpec: pref?.wowSpec || null,
    };
  });

  await prisma.raidAttendance.createMany({
    data: attendanceData,
  });

  // Create embed with guild's language
  const embed = await createRaidEmbed(raid.id, guildData.language);

  // Get translations for buttons
  const trans = getTranslations(guildData.language || 'en');

  // Create buttons (2 rows due to Discord limit of 5 buttons per row)
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`raid_optin_${raid.id}`)
      .setLabel(trans.optIn)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`raid_late_${raid.id}`)
      .setLabel(trans.runningLateButton)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`raid_optout_${raid.id}`)
      .setLabel(trans.optOut)
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`raid_class_${raid.id}`)
      .setLabel(trans.setClassSpec)
      .setStyle(ButtonStyle.Primary)
  );

  // Send public raid message to channel
  if (!interaction.channel || !('send' in interaction.channel)) {
    await interaction.editReply({
      content: '❌ Cannot send message to this channel type.',
    });
    return;
  }

  // Build role mentions if ping_roles is true
  let content = '';
  if (pingRoles) {
    const roleMentions = buildRoleMentions(interaction.guild!, roleIds);
    
    if (roleMentions) {
      content = `${roleMentions} - New raid created!`;
    }
  }

  const message = await interaction.channel.send({
    content: content || undefined,
    embeds: [embed],
    components: [row1, row2],
  });

  // Update raid with message ID
  await prisma.raid.update({
    where: { id: raid.id },
    data: { messageId: message.id },
  });

  // Send ephemeral confirmation to command user — FREE guilds get the premium nudge appended.
  await interaction.editReply({
    content: `✅ Raid "${title}" created successfully with ${eligibleMembers.size} members!`
      + (await freeTierHint(interaction.guildId, guildData.language || 'en')),
  });
}

export async function createRaidEmbed(raidId: string, language?: string): Promise<EmbedBuilder> {
  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: {
      attendance: {
        orderBy: { username: 'asc' },
      },
      guild: true,
    },
  });

  if (!raid) {
    throw new Error('Raid not found');
  }

  // Use provided language or fetch from guild database
  const lang = language || raid.guild.language || 'en';
  const trans = getTranslations(lang);

   const attending = raid.attendance.filter((a: typeof raid.attendance[0]) => a.status === 'attending');
   const optedOut = raid.attendance.filter((a: typeof raid.attendance[0]) => a.status === 'opted_out');
   const runningLate = raid.attendance.filter((a: typeof raid.attendance[0]) => a.status === 'late');

   const totalParticipants = attending.length + optedOut.length + runningLate.length;

  // Calculate role composition and sort by role
  const composition: RoleComposition = {
    tanks: 0,
    healers: 0,
    melee: 0,
    ranged: 0,
    noClass: 0,
  };

  // Sort attending by role: Tanks -> Healers -> Melee -> Ranged -> No class set, then by class, then by username
  const sortedAttending = attending.sort((a: typeof raid.attendance[0], b: typeof raid.attendance[0]) => {
    const roleA = getSpecRole(a.wowClass, a.wowSpec);
    const roleB = getSpecRole(b.wowClass, b.wowSpec);

    const roleOrder = { Tank: 0, Healer: 1, Melee: 2, Ranged: 3 };
    const orderA = roleA ? roleOrder[roleA] : 4;
    const orderB = roleB ? roleOrder[roleB] : 4;

    if (orderA !== orderB) return orderA - orderB;

    // Sort by class within same role
    const classA = a.wowClass || '';
    const classB = b.wowClass || '';
    if (classA !== classB) return classA.localeCompare(classB);

    // Then by username
    return a.username.localeCompare(b.username);
  });

  sortedAttending.forEach((a: typeof raid.attendance[0]) => {
    const role = getSpecRole(a.wowClass, a.wowSpec);
    if (role === 'Tank') composition.tanks++;
    else if (role === 'Healer') composition.healers++;
    else if (role === 'Melee') composition.melee++;
    else if (role === 'Ranged') composition.ranged++;
    else composition.noClass++;
  });

  // Group attending players by role
  const tankList: string[] = [];
  const healerList: string[] = [];
  const meleeDpsList: string[] = [];
  const rangedDpsList: string[] = [];
  const noClassList: string[] = [];

  sortedAttending.forEach((a: typeof raid.attendance[0]) => {
    const role = getSpecRole(a.wowClass, a.wowSpec);
    const specSymbol = getSpecSymbol(a.wowClass, a.wowSpec);
    const classSpec = a.wowClass
      ? a.wowSpec
        ? `${a.wowClass} (${a.wowSpec})`
        : a.wowClass
      : null;
    const prefix = specSymbol ? `${specSymbol} ` : '';
    const displayName = `${prefix}${a.username}`;
    const line = `${displayName}`;

    if (role === 'Tank') tankList.push(line);
    else if (role === 'Healer') healerList.push(line);
    else if (role === 'Melee') meleeDpsList.push(line);
    else if (role === 'Ranged') rangedDpsList.push(line);
    else noClassList.push(line);
  });

  const tankText = tankList.length > 0 
    ? tankList.join('\n') 
    : '\u200B';
  const healerText = healerList.length > 0 
    ? healerList.join('\n') 
    : '\u200B';
  const meleeDpsText = meleeDpsList.length > 0 
    ? meleeDpsList.join('\n') 
    : '\u200B';
  const rangedDpsText = rangedDpsList.length > 0 
    ? rangedDpsList.join('\n') 
    : '\u200B';

  const timestamp = Math.floor(raid.raidDate.getTime() / 1000);

  // Determine raid status display
  let raidStatusText = trans.statusOpen;
  let embedColor = 0x00ae86; // Green for open
  if (raid.status === 'closed') {
    raidStatusText = trans.statusClosed;
    embedColor = 0xff0000; // Red for closed
  } else if (raid.status === 'cancelled') {
    raidStatusText = trans.statusCancelled;
    embedColor = 0x808080; // Gray for cancelled
  }

   const participantsLabel = lang === 'de' ? 'Teilnehmer' : 'Participants';
    const metaValue = `${raidStatusText}\n📅 <t:${timestamp}:F> (<t:${timestamp}:R>)\n👥 ${totalParticipants} ${participantsLabel}`;

    const baseFields: { name: string; value: string; inline: boolean }[] = [
      { name: trans.raidStatus, value: metaValue, inline: false },
    ];

    const embed = new EmbedBuilder()
      .setTitle(`${raid.description || trans.raidEvent}`)
      .setColor(embedColor)
      .addFields(...baseFields);

    // 2x2 grid layout: Tank | Heal
    //                      Melee | Ranged
    embed.addFields(
      {
        name: `🛡️ ${trans.tank} (${composition.tanks})`,
        value: tankText,
        inline: true,
      },
      {
        name: `💚 ${trans.heal} (${composition.healers})`,
        value: healerText,
        inline: true,
      }
    );

    // Force row break for next fields
    embed.addFields({ name: '\u200B', value: '\u200B', inline: false });

    embed.addFields(
      {
        name: `⚔️ ${trans.compositionMeleeDps} (${composition.melee})`,
        value: meleeDpsText,
        inline: true,
      },
      {
        name: `🏹 ${trans.compositionRangedDps} (${composition.ranged})`,
        value: rangedDpsText,
        inline: true,
      }
    );

    // Add running late section below the 4-column layout
    if (runningLate.length > 0) {
      const lateText = runningLate.map((a: typeof raid.attendance[0]) => `${a.username}`).join('\n');
      const truncatedLate = lateText.length > 1024
        ? lateText.substring(0, 1021) + '...'
        : lateText;
      embed.addFields({ name: `⏰ ${trans.runningLate} (${runningLate.length})`, value: truncatedLate, inline: false });
    }

    // Add opted out section
    if (optedOut.length > 0) {
      const optedOutText = optedOut.map((a: typeof raid.attendance[0]) => {
        if (a.optoutReason) {
          return `${a.username} (${a.optoutReason})`;
        }
        return a.username;
      }).join('\n');
      const truncatedOptedOut = optedOutText.length > 1024
        ? optedOutText.substring(0, 1021) + '...'
        : optedOutText;
      embed.addFields({ name: `❌ ${trans.optedOut} (${optedOut.length})`, value: truncatedOptedOut, inline: false });
    }

    // Add no class section
    if (noClassList.length > 0) {
      const noClassText = noClassList.join('\n');
      const truncatedNoClass = noClassText.length > 1024
        ? noClassText.substring(0, 1021) + '...'
        : noClassText;
      embed.addFields({ name: `❓ ${trans.noClass} (${composition.noClass})`, value: truncatedNoClass, inline: false });
    }

    embed
      .addFields({ name: '\u200b', value: '[Web](https://raidpresence.dev) • [Vote](https://raidpresence.dev/vote)', inline: false })
      .setFooter({ text: `${trans.raidId}: ${raid.id} | v${VERSION}` })
      .setTimestamp();

    return embed;
}

// Intentionally open to every member: `/raid list` is purely read-only, replies
// ephemerally and only shows upcoming raids of the caller's own guild/team — exactly
// the information participants need in order to sign up. Authorization for every
// mutating subcommand is enforced at runtime via canManageRaids.
async function handleListRaids(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const listGuildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
    select: { language: true },
  });

  const teamOption = interaction.options.get(TEAM_OPTION_NAME, false)?.value as string | undefined;
  const { team, error: teamError } = await resolveTeam(interaction.guild.id, teamOption ?? null);
  if (teamError === 'not_found') {
    await interaction.editReply({
      content: t(listGuildData?.language || 'en', 'teamNotFound', { name: teamOption ?? '' }),
    });
    return;
  }

  const now = new Date();
  const raids = await prisma.raid.findMany({
    where: {
      guildId: interaction.guild.id,
      teamId: team.id,
      raidDate: {
        gte: now,
      },
    },
    orderBy: {
      raidDate: 'asc',
    },
    include: {
      attendance: true,
    },
  });

  // Only disambiguate by team once the guild actually has more than one — single-team
  // guilds keep the exact wording they had before multi-team support.
  const isMultiTeam = (await countTeams(interaction.guild.id)) > 1;

  // FREE guilds get the premium nudge on both successful list outcomes (empty and populated).
  const listHint = await freeTierHint(interaction.guildId, listGuildData?.language || 'en');

  if (raids.length === 0) {
    await interaction.editReply({
      content: (isMultiTeam
        ? `📅 No upcoming raids found for **${team.name}**.`
        : '📅 No upcoming raids found.') + listHint,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(isMultiTeam ? `Upcoming Raids — ${team.name}` : 'Upcoming Raids')
    .setColor(0x00ae86)
    .setDescription(
      raids
        .map((raid: typeof raids[0]) => {
          const attending = raid.attendance.filter((a: typeof raid.attendance[0]) => a.status === 'attending').length;
          const total = raid.attendance.length;
          return `**${raid.description}**\nDate: <t:${Math.floor(raid.raidDate.getTime() / 1000)}:F>\nAttending: ${attending}/${total}\nID: \`${raid.id}\``;
        })
        .join('\n\n')
    )
    .addFields({ name: '\u200b', value: '[Web](https://raidpresence.dev) • [Vote](https://raidpresence.dev/vote)', inline: false })
    .setFooter({ text: `v${VERSION}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed], content: listHint || undefined });
}

async function handleDeleteRaid(interaction: ChatInputCommandInteraction) {
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
      content: '❌ You do not have permission to delete raids. Ask your server admin to configure raid leader roles.',
    });
    return;
  }

  const raidId = interaction.options.get('raid_id', true).value as string;

  // Check if raid exists and belongs to this guild
  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: { guild: true },
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

  // Delete the raid message if it exists
  if (raid.messageId && raid.channelId) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channelId);
      if (channel?.isTextBased() && 'messages' in channel) {
        const message = await channel.messages.fetch(raid.messageId);
        await message.delete();
      }
    } catch (error) {
      console.error('Error deleting raid message:', error);
      // Continue with database deletion even if message deletion fails
    }
  }

  // Delete from database (cascades to attendance)
  await prisma.raid.delete({
    where: { id: raidId },
  });

  const deleteTeamLabel = await getTeamLabel(interaction.guild.id, raid.teamId);

  await interaction.editReply({
    content:
      t(raid.guild.language || 'en', 'raidDeletedSuccess', { title: raid.description || 'Raid' }) +
      teamSuffix(deleteTeamLabel),
  });
}

async function handleEditRaid(interaction: ChatInputCommandInteraction) {
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
      content: '❌ You do not have permission to edit raids. Ask your server admin to configure raid leader roles.',
    });
    return;
  }

  const raidId = interaction.options.get('raid_id', true).value as string;
  const dateStr = interaction.options.get('date', false)?.value as string;
  const timeStr = interaction.options.get('time', false)?.value as string;
  const title = interaction.options.get('title', false)?.value as string;
  const status = interaction.options.get('status', false)?.value as string;

  // At least one option must be provided
  if (!dateStr && !timeStr && !title && !status) {
    await interaction.editReply({
      content: '❌ You must provide at least one field to edit (date, time, title, or status).',
    });
    return;
  }

  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: { guild: true },
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

  if (raid.raidDate < new Date()) {
    await interaction.editReply({
      content: '❌ Cannot edit raids that have already passed.',
    });
    return;
  }

  const guildData = raid.guild;
  const timezoneOffsetHours = guildData.timezoneOffset || 0;

  let newRaidDate: Date | undefined;

  // Validate date/time if provided
  if (dateStr || timeStr) {
    if (!dateStr || !timeStr) {
      await interaction.editReply({
        content: '❌ Both date and time must be provided together.',
      });
      return;
    }

    const dateTimeStr = `${dateStr}T${timeStr}:00`;
    const localDate = new Date(dateTimeStr);

    if (isNaN(localDate.getTime())) {
      await interaction.editReply({
        content: '❌ Invalid date or time format. Use YYYY-MM-DD for date and HH:MM for time.',
      });
      return;
    }

    // Apply timezone offset (user enters local time, we store UTC)
    newRaidDate = new Date(localDate.getTime() - (timezoneOffsetHours * 60 * 60 * 1000));

    if (newRaidDate < new Date()) {
      await interaction.editReply({
        content: '❌ New raid date must be in the future!',
      });
      return;
    }
  }

  // Prepare update data
  const updateData: any = {};
  if (title !== undefined) updateData.description = title;
  if (status !== undefined) updateData.status = status;
  if (newRaidDate) updateData.raidDate = newRaidDate;

  // Update raid in database
  await prisma.raid.update({
    where: { id: raidId },
    data: updateData,
  });

  // Update the raid message embed and components
  if (raid.messageId && raid.channelId) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channelId);
      if (channel?.isTextBased() && 'messages' in channel) {
        const message = await channel.messages.fetch(raid.messageId!);
        const embed = await createRaidEmbed(raidId, guildData.language);

         // Determine components based on status
         let components: any[] = [];
         const effectiveStatus = status ?? raid.status;
         if (effectiveStatus !== 'closed' && effectiveStatus !== 'cancelled') {
           // Add buttons if not closed/cancelled
           const trans = getTranslations(guildData.language || 'en');

          const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`raid_optin_${raidId}`)
              .setLabel(trans.optIn)
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`raid_late_${raidId}`)
              .setLabel(trans.runningLateButton)
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`raid_optout_${raidId}`)
              .setLabel(trans.optOut)
              .setStyle(ButtonStyle.Danger)
          );

          const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`raid_class_${raidId}`)
              .setLabel(trans.setClassSpec)
              .setStyle(ButtonStyle.Primary)
          );

          components = [row1, row2];
        }

        await message.edit({
          embeds: [embed],
          components,
        });
      }
    } catch (error) {
      console.error('Error updating raid message:', error as Error);
    }
  }

  await interaction.editReply({
    content: `✅ Raid "${raid.description}" has been updated successfully.`,
  });
}

async function handleCloneRaid(interaction: ChatInputCommandInteraction) {

  if (!interaction.guild || !interaction.channel) {
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
      content: '❌ You do not have permission to clone raids. Ask your server admin to configure raid leader roles.',
    });
    return;
  }

  // Check if channel is sendable
  if (!('send' in interaction.channel)) {
    await interaction.editReply({
      content: '❌ Cannot send message to this channel type.',
    });
    return;
  }

  const raidId = interaction.options.get('raid_id', true).value as string;
  const dateStr = interaction.options.get('date', true).value as string;
  const timeStr = interaction.options.get('time', false)?.value as string;
  const customTitle = interaction.options.get('title', false)?.value as string;

  // Validate time format if provided
  let hour: number | undefined;
  let min: number | undefined;
  if (timeStr) {
    const timeRegex = /^(\d{1,2}):(\d{2})$/;
    const match = timeStr.match(timeRegex);
    if (!match) {
      await interaction.editReply({
        content: '❌ Invalid time format. Please use HH:MM (24-hour format).',
      });
      return;
    }
    hour = parseInt(match[1], 10);
    min = parseInt(match[2], 10);
    if (isNaN(hour) || hour < 0 || hour > 23) {
      await interaction.editReply({
        content: '❌ Invalid hour in time.',
      });
      return;
    }
    if (isNaN(min) || min < 0 || min > 59) {
      await interaction.editReply({
        content: '❌ Invalid minute in time.',
      });
      return;
    }
  }

  // Fetch and validate source raid existence
  const sourceRaid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: { guild: true },
  });

  if (!sourceRaid) {
    await interaction.editReply({
      content: '❌ Raid not found.',
    });
    return;
  }

  if (sourceRaid.guildId !== interaction.guild!.id) {
    await interaction.editReply({
      content: '❌ This raid does not belong to this server.',
    });
    return;
  }

  // Check source raid has roles
  if (!sourceRaid.roles || sourceRaid.roles.trim() === '') {
    await interaction.editReply({
      content: '❌ Cannot clone a raid with no roles configured.',
    });
    return;
  }

  // Get guild settings for timezone
  const guildData = sourceRaid.guild;

  // An explicitly named team wins over the source raid's team. Resolved up front so an
  // unknown name fails before the expensive member scanning, while the source-team
  // fallback stays lazy further down (it may have to create the default team).
  const teamOption = interaction.options.get(TEAM_OPTION_NAME, false)?.value as string | undefined;
  let explicitTeamId: string | undefined;
  if (teamOption?.trim()) {
    const { team, error: teamError } = await resolveTeam(interaction.guild!.id, teamOption);
    if (teamError === 'not_found') {
      await interaction.editReply({
        content: t(guildData.language || 'en', 'teamNotFound', { name: teamOption }),
      });
      return;
    }
    explicitTeamId = team.id;
  }

  // Parse and validate date
  const dateParts = dateStr.split('-');
  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1; // JS months are 0-based
  const day = parseInt(dateParts[2], 10);

  if (month < 0 || month > 11) {
    await interaction.editReply({
      content: '❌ Invalid month in date.',
    });
    return;
  }

  if (day < 1 || day > new Date(year, month + 1, 0).getDate()) {
    await interaction.editReply({
      content: '❌ Invalid day in date.',
    });
    return;
  }

  // Compute new raid date
  const timezoneOffsetHours = guildData.timezoneOffset || 0;

  let localTimeStr: string;
  if (timeStr) {
    localTimeStr = timeStr;
  } else {
    // Extract time from source raid (convert UTC to local)
    const sourceLocalDate = new Date(sourceRaid.raidDate.getTime() + (timezoneOffsetHours * 60 * 60 * 1000));
    localTimeStr = sourceLocalDate.toISOString().split('T')[1].substring(0, 5); // HH:MM
  }

  const localDateTimeStr = `${dateStr}T${localTimeStr}:00`;
  const localDate = new Date(localDateTimeStr);

  if (isNaN(localDate.getTime())) {
    await interaction.editReply({
      content: '❌ Invalid date or time combination.',
    });
    return;
  }

  // Apply timezone offset to store as UTC
  const raidDate = new Date(localDate.getTime() - (timezoneOffsetHours * 60 * 60 * 1000));

  if (raidDate < new Date()) {
    await interaction.editReply({
      content: '❌ New raid date must be in the future.',
    });
    return;
  }

  // Get eligible members (same as source raid's roles)
  const { validIds: roleIds } = parseRoleInput(sourceRaid.roles, interaction.guild!);

  let eligibleMembers = new Set<string>();

  // Fetch all members if not cached
  try {
    await interaction.guild!.members.fetch();
  } catch (error) {
    if (isRateLimitError(error)) {
      await handleRateLimitError(error, interaction, guildData.language || 'en');
      return;
    }
    throw error;
  }

  for (const [memberId, member] of interaction.guild!.members.cache) {
    if (member.user.bot) continue;

    const hasRaidRole = member.roles.cache.some((role) =>
      roleIds.includes(role.id) || roleIds.includes(role.name)
    );

    if (hasRaidRole) {
      eligibleMembers.add(memberId);
    }
  }

  if (eligibleMembers.size === 0) {
    await interaction.editReply({
      content: '❌ No eligible members found with the required roles.',
    });
    return;
  }

  // Ensure all eligible members have UserPreference records
  for (const userId of eligibleMembers) {
    const member = interaction.guild!.members.cache.get(userId);
    if (member) {
      await prisma.userPreference.upsert({
        where: {
          userId_guildId: {
            userId,
            guildId: interaction.guild!.id,
          },
        },
        update: {
          username: member.displayName,
        },
        create: {
          userId,
          guildId: interaction.guild!.id,
          username: member.displayName,
        },
      });
    }
  }

  // Get user preferences for class/spec (role-specific preferred over global)
  const memberRolesMap = new Map<string, string[]>();
  for (const userId of eligibleMembers) {
    const member = interaction.guild!.members.cache.get(userId);
    if (member) {
      memberRolesMap.set(userId, Array.from(member.roles.cache.values()).map(r => r.id));
    }
  }
  const prefsMap = await getEffectivePrefsMap(
    Array.from(eligibleMembers),
    interaction.guild!.id,
    roleIds,
    memberRolesMap,
  );

  // Determine description
  const description = customTitle || sourceRaid.description || 'Cloned Raid';

  // Without an explicit option the clone stays in the source raid's team; the default-team
  // fallback covers source raids that predate the multi-team migration.
  const targetTeamId =
    explicitTeamId || sourceRaid.teamId || (await resolveDefaultTeamId(interaction.guild!.id));

  // Create cloned raid
  const newRaid = await prisma.raid.create({
    data: {
      guildId: interaction.guild!.id,
      teamId: targetTeamId,
      channelId: interaction.channel.id,
      raidDate,
      description,
      roles: sourceRaid.roles,
      createdBy: interaction.user.id,
      createdFromTemplateId: sourceRaid.id,
      clonedAt: new Date(),
    },
  });

  // Create attendance records
  const attendanceData = Array.from(eligibleMembers).map((userId) => {
    const member = interaction.guild!.members.cache.get(userId);
    const pref = prefsMap.get(userId);
    return {
      raidId: newRaid.id,
      // Denormalised from the resolved team rather than the create result so it is never undefined.
      teamId: targetTeamId,
      userId,
      guildId: interaction.guild!.id,
      username: member?.displayName || 'Unknown',
      status: 'attending' as const,
      wowClass: pref?.wowClass || null,
      wowSpec: pref?.wowSpec || null,
    };
  });

  await prisma.raidAttendance.createMany({
    data: attendanceData,
  });

  // Create embed with guild's language
  const embed = await createRaidEmbed(newRaid.id, guildData.language);

  // Get translations for buttons
  const trans = getTranslations(guildData.language || 'en');

  // Create buttons
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`raid_optin_${newRaid.id}`)
      .setLabel(trans.optIn)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`raid_late_${newRaid.id}`)
      .setLabel(trans.runningLateButton)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`raid_optout_${newRaid.id}`)
      .setLabel(trans.optOut)
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`raid_class_${newRaid.id}`)
      .setLabel(trans.setClassSpec)
      .setStyle(ButtonStyle.Primary)
  );

  // Send public raid message to channel
  const message = await interaction.channel.send({
    embeds: [embed],
    components: [row1, row2],
  });

  // Update raid with message ID
  await prisma.raid.update({
    where: { id: newRaid.id },
    data: { messageId: message.id },
  });

  // Resolve the deferred ephemeral reply with a confirmation — FREE guilds get the premium nudge appended.
  await interaction.editReply({
    content: `✅ Raid "${description}" cloned successfully with ${eligibleMembers.size} members!`
      + (await freeTierHint(interaction.guildId, guildData.language || 'en')),
  });
  return;
}




async function handleArchiveRaid(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  // Premium gate: archive (before deferReply so gateFeature can reply directly)
  const archiveGuildData = await prisma.guild.findUnique({ where: { id: interaction.guild.id }, select: { language: true } });
  if (!(await gateFeature(interaction, 'raid.archive', archiveGuildData?.language || 'en'))) return;

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

  try {
    await archiveRaid(raidId, interaction.guild!.id, interaction.client);
    const archivedRaid = await prisma.raid.findUnique({
      where: { id: raidId },
      select: { teamId: true },
    });
    const archiveTeamLabel = await getTeamLabel(interaction.guild.id, archivedRaid?.teamId);
    await interaction.editReply({
      content: `✅ Raid archived successfully.${teamSuffix(archiveTeamLabel)}`,
    });
  } catch (error) {
    console.error('Error archiving raid:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    await interaction.editReply({
      content: `❌ ${message}`,
    });
  }
}

async function handleUnarchiveRaid(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  // Premium gate: archive (before deferReply so gateFeature can reply directly)
  const unarchiveGuildData = await prisma.guild.findUnique({ where: { id: interaction.guild.id }, select: { language: true } });
  if (!(await gateFeature(interaction, 'raid.archive', unarchiveGuildData?.language || 'en'))) return;

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

  try {
    await unarchiveRaid(raidId, interaction.guild!.id, interaction.client);
    const restoredRaid = await prisma.raid.findUnique({
      where: { id: raidId },
      select: { teamId: true },
    });
    const unarchiveTeamLabel = await getTeamLabel(interaction.guild.id, restoredRaid?.teamId);
    await interaction.editReply({
      content: `✅ Raid restored successfully.${teamSuffix(unarchiveTeamLabel)}`,
    });
  } catch (error) {
    console.error('Error restoring raid:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    await interaction.editReply({
      content: `❌ ${message}`,
    });
  }
}

function getStartDate(period: string): Date {
  const now = new Date();
  switch (period) {
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

async function handleSearchArchive(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  // Premium gate: archive (before deferReply so gateFeature can reply directly)
  const searchGuildData = await prisma.guild.findUnique({ where: { id: interaction.guild.id }, select: { language: true } });
  if (!(await gateFeature(interaction, 'raid.archive', searchGuildData?.language || 'en'))) return;

  await interaction.deferReply({ ephemeral: true });

  // Check permissions: unlike `/raid list`, the archive search exposes historical
  // attendance data, so it stays limited to raid leaders/admins.
  const member = interaction.member;
  if (!member || !(await canManageRaids(member as any))) {
    await interaction.editReply({
      content: '❌ You do not have permission to search the raid archive. Ask your server admin to configure raid leader roles.',
    });
    return;
  }

  const query = interaction.options.get('query', true).value as string;
  const period = interaction.options.get('period', false)?.value as string || 'month';
  const teamOption = interaction.options.get(TEAM_OPTION_NAME, false)?.value as string | undefined;

  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  const { team, error: teamError } = await resolveTeam(interaction.guild.id, teamOption ?? null);
  if (teamError) {
    await interaction.editReply({
      content: t(guildData?.language || 'en', 'teamNotFound', { name: teamOption ?? '' }),
    });
    return;
  }

  const startDate = getStartDate(period);

  const results = await searchArchive({
    guildId: interaction.guild.id,
    query,
    startDate,
    teamId: team.id,
  });

  const embed = formatArchiveSearchEmbed(results, query, period, guildData?.language || 'en');

  // Multi-team guilds: make the scope of these results explicit. Single-team guilds keep
  // the previous title verbatim.
  const searchTeamLabel = await getTeamLabel(interaction.guild.id, team.id);
  if (searchTeamLabel) {
    embed.setTitle(`${embed.data.title} — ${searchTeamLabel}`);
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleCloseRaid(interaction: ChatInputCommandInteraction) {
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
      content: '❌ You do not have permission to close raids.',
    });
    return;
  }

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

  if (raid.status === 'closed' || raid.status === 'cancelled') {
    await interaction.editReply({
      content: '❌ This raid is already closed or cancelled.',
    });
    return;
  }

  // Update raid status
  await prisma.raid.update({
    where: { id: raidId },
    data: { status: 'closed' },
  });

  // Update Discord message with closed status embed and remove buttons
  if (raid.messageId) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channelId);
      if (channel?.isTextBased()) {
        const message = await (channel as any).messages.fetch(raid.messageId);
        const updatedEmbed = await createRaidEmbed(raidId, raid.guild.language || 'en');
        await message.edit({
          embeds: [updatedEmbed],
          components: [],
        });
      }
    } catch (error) {
      console.error('[handleCloseRaid] Failed to update message:', error);
      // Continue - raid was closed in DB, just message update failed
    }
  }

  const closeTeamLabel = await getTeamLabel(interaction.guild.id, raid.teamId);

  await interaction.editReply({
    content: `✅ Raid has been closed.${teamSuffix(closeTeamLabel)}`,
  });
}

async function handleOpenRaid(interaction: ChatInputCommandInteraction) {
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
      content: '❌ You do not have permission to open raids.',
    });
    return;
  }

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

  if (raid.status !== 'closed') {
    await interaction.editReply({
      content: '❌ This raid is not closed.',
    });
    return;
  }

  // Update raid status
  await prisma.raid.update({
    where: { id: raidId },
    data: { status: 'open' },
  });

  // Update Discord message with open status embed and restore buttons
  if (raid.messageId) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channelId);
      if (channel?.isTextBased()) {
        const message = await (channel as any).messages.fetch(raid.messageId);
        const updatedEmbed = await createRaidEmbed(raidId, raid.guild.language || 'en');

        // Get translations for buttons
        const trans = getTranslations(raid.guild.language || 'en');

        // Create buttons (2 rows due to Discord limit of 5 buttons per row)
        const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`raid_optin_${raid.id}`)
            .setLabel(trans.optIn)
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`raid_late_${raid.id}`)
            .setLabel(trans.runningLateButton)
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`raid_optout_${raid.id}`)
            .setLabel(trans.optOut)
            .setStyle(ButtonStyle.Danger)
        );

        const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`raid_class_${raid.id}`)
            .setLabel(trans.setClassSpec)
            .setStyle(ButtonStyle.Primary)
        );

        // Restore buttons when opened
        await message.edit({
          embeds: [updatedEmbed],
          components: [row1, row2],
        });
      }
    } catch (error) {
      console.error('[handleOpenRaid] Failed to update message:', error);
      // Continue - raid was opened in DB, just message update failed
    }
  }

  const openTeamLabel = await getTeamLabel(interaction.guild.id, raid.teamId);

  await interaction.editReply({
    content: `✅ Raid has been opened.${teamSuffix(openTeamLabel)}`,
  });
}

async function handleCancelRaid(interaction: ChatInputCommandInteraction) {
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
      content: '❌ You do not have permission to cancel raids.',
    });
    return;
  }

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

  if (raid.status === 'cancelled') {
    await interaction.editReply({
      content: '❌ This raid is already cancelled.',
    });
    return;
  }

  // Update raid status
  await prisma.raid.update({
    where: { id: raidId },
    data: { status: 'cancelled' },
  });

  // Update Discord message with cancelled status embed and remove buttons
  if (raid.messageId) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channelId);
      if (channel?.isTextBased()) {
        const message = await (channel as any).messages.fetch(raid.messageId);
        const updatedEmbed = await createRaidEmbed(raidId, raid.guild.language || 'en');
        await message.edit({
          embeds: [updatedEmbed],
          components: [],
        });
      }
    } catch (error) {
      console.error('[handleCancelRaid] Failed to update message:', error);
      // Continue - raid was cancelled in DB, just message update failed
    }
  }

  const cancelTeamLabel = await getTeamLabel(interaction.guild.id, raid.teamId);

  await interaction.editReply({
    content: `✅ Raid has been cancelled.${teamSuffix(cancelTeamLabel)}`,
  });
}

async function handleRemindRaid(interaction: ChatInputCommandInteraction) {
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
      content: '❌ You do not have permission to send reminders.',
    });
    return;
  }

  const raidId = interaction.options.get('raid_id', true).value as string;
  const customMessage = interaction.options.get('message', false)?.value as string | undefined;

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

  // Check if channel exists
  if (!raid.channelId) {
    await interaction.editReply({
      content: '❌ Could not find the raid channel.',
    });
    return;
  }

  // Get channel and send reminder
  const channel = await interaction.client.channels.fetch(raid.channelId);
  if (!channel?.isTextBased()) {
    await interaction.editReply({
      content: '❌ Could not send reminder to raid channel.',
    });
    return;
  }

  const optedOut = raid.attendance.filter(a => a.status === 'opted_out');
  const attendingCount = raid.attendance.filter(a => a.status === 'attending').length;

  // Get guild config for roles (using raid-specific roles or guild default)
  const roleSource = raid.roles && raid.roles.trim().length > 0
    ? raid.roles
    : raid.guild.raidRoles || '';
  const roleIds = roleSource.split(',').map((r: string) => r.trim()).filter(Boolean);
  let roleMentions = roleIds.length > 0 ? buildRoleMentions(interaction.guild!, roleIds) : '';

  // Fall back to @everyone if no valid roles found
  if (!roleMentions) {
    roleMentions = '@everyone';
  }

  const timestamp = Math.floor(raid.raidDate.getTime() / 1000);
  const trans = getTranslations(raid.guild.language || 'en');

  const remindTeamLabel = await getTeamLabel(interaction.guild.id, raid.teamId);

  // Build fields array
  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: '📅 Date & Time', value: `<t:${timestamp}:F> (<t:${timestamp}:R>)`, inline: false },
    { name: '👥 Current Attendance', value: `${attendingCount} confirmed`, inline: false },
  ];

  // Public reminder: on multi-team guilds spell out which team is being pinged.
  if (remindTeamLabel) {
    fields.push({ name: '🛡️ Team', value: remindTeamLabel, inline: false });
  }

  if (customMessage) {
    // Truncate message to 1024 chars if needed (Discord embed field limit)
    const truncatedMessage = customMessage.length > 1024
      ? customMessage.substring(0, 1021) + '...'
      : customMessage;
    fields.push({
      name: trans.customMessage || 'Message from Raid Leader',
      value: truncatedMessage,
      inline: false,
    });
  }

  if (optedOut.length > 0) {
    // Truncate opted-out list to 1024 chars if needed (Discord embed field limit)
    const optedOutText = optedOut.map(a => `${a.username}${a.optoutReason ? ` (${a.optoutReason})` : ''}`).join('\n');
    const truncatedOptedOut = optedOutText.length > 1024
      ? optedOutText.substring(0, 1021) + '...'
      : optedOutText;
    fields.push({
      name: `${trans.optedOutPlayers} (${optedOut.length})`,
      value: truncatedOptedOut,
      inline: false,
    });
  }

  // Build reminder embed
  const reminderEmbed = new EmbedBuilder()
    .setTitle('🔔 Raid Reminder')
    .setDescription(`**${raid.description}**`)
    .addFields(...fields)
    .setColor(0x00ae86)
    .setTimestamp();

  const messageContent = roleMentions;
  await (channel as any).send({
    content: messageContent,
    embeds: [reminderEmbed],
  });

  await interaction.editReply({
    content: `✅ Reminder sent for **${raid.description}**.${teamSuffix(remindTeamLabel)}`,
  });
}

async function handleRefreshRaid(interaction: ChatInputCommandInteraction) {
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
      content: '❌ You do not have permission to refresh raids.',
    });
    return;
  }

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

  // Get guild config for roles
  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  if (!guildData) {
    await interaction.editReply({
      content: '❌ Guild configuration not found.',
    });
    return;
  }

  const roleSource = raid.roles && raid.roles.trim().length > 0
    ? raid.roles
    : guildData.raidRoles || '';
  const roleIds = roleSource.split(',').map((r: string) => r.trim()).filter(Boolean);

  let eligibleMembers = new Set<string>();

  if (roleIds.length > 0) {
    try {
      await interaction.guild.members.fetch();
    } catch (error) {
      if (isRateLimitError(error)) {
        await handleRateLimitError(error, interaction, raid.guild.language || 'en');
        return;
      }
      throw error;
    }

    for (const [memberId, guildMember] of interaction.guild.members.cache) {
      if (guildMember.user.bot) continue;

      const hasRaidRole = guildMember.roles.cache.some((role) =>
        roleIds.includes(role.id) || roleIds.includes(role.name)
      );

      if (hasRaidRole) {
        eligibleMembers.add(memberId);
      }
    }
  } else {
    try {
      await interaction.guild.members.fetch();
    } catch (error) {
      if (isRateLimitError(error)) {
        await handleRateLimitError(error, interaction, raid.guild.language || 'en');
        return;
      }
      throw error;
    }
    for (const [memberId, guildMember] of interaction.guild.members.cache) {
      if (!guildMember.user.bot) {
        eligibleMembers.add(memberId);
      }
    }
  }

  const currentAttendanceUserIds = new Set(raid.attendance.map(a => a.userId));

  // Add new members
  const newMembers = Array.from(eligibleMembers).filter(id => !currentAttendanceUserIds.has(id));

  if (newMembers.length > 0) {
    for (const userId of newMembers) {
      const member = interaction.guild.members.cache.get(userId);
      if (member) {
        await prisma.userPreference.upsert({
          where: {
            userId_guildId: {
              userId,
              guildId: interaction.guild!.id,
            },
          },
          update: {
            username: member.displayName,
          },
          create: {
            userId,
            guildId: interaction.guild.id,
            username: member.displayName,
          },
        });
      }
    }

    // Get user preferences for class/spec (role-specific preferred over global)
    const memberRolesMap = new Map<string, string[]>();
    for (const userId of newMembers) {
      const member = interaction.guild.members.cache.get(userId);
      if (member) {
        memberRolesMap.set(userId, Array.from(member.roles.cache.values()).map(r => r.id));
      }
    }
    const rawRoles = raid.roles.split(',').map((r: string) => r.trim()).filter(Boolean);
    const raidRoleIds = normalizeRoleIds(rawRoles, interaction.guild);
    const prefsMap = await getEffectivePrefsMap(
      newMembers,
      interaction.guild.id,
      raidRoleIds,
      memberRolesMap,
    );

    const attendanceData = newMembers.map(userId => {
      const member = interaction.guild!.members.cache.get(userId);
      const pref = prefsMap.get(userId);
      return {
        raidId: raid.id,
        teamId: raid.teamId,
        userId,
        username: member?.displayName || 'Unknown',
        status: 'attending' as const,
        wowClass: pref?.wowClass || null,
        wowSpec: pref?.wowSpec || null,
        guildId: interaction.guild!.id,
      };
    });

    await prisma.raidAttendance.createMany({
      data: attendanceData,
    });
  }

  // Remove ineligible members
  const membersToRemove = Array.from(currentAttendanceUserIds).filter(id => !eligibleMembers.has(id));

  if (membersToRemove.length > 0) {
    await prisma.raidAttendance.deleteMany({
      where: {
        raidId: raid.id,
        userId: { in: membersToRemove },
      },
    });
  }

  // Update Discord message with refreshed embed
  if (raid.messageId && (newMembers.length > 0 || membersToRemove.length > 0)) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channelId);
      if (channel?.isTextBased()) {
        const message = await (channel as any).messages.fetch(raid.messageId);
        const updatedEmbed = await createRaidEmbed(raidId, raid.guild.language || 'en');
        await message.edit({
          embeds: [updatedEmbed],
        });
      }
    } catch (error) {
      console.error('[handleRefreshRaid] Failed to update message:', error);
      // Continue - roster was updated in DB, just message update failed
    }
  }

  // Report changes
  const refreshTeamLabel = await getTeamLabel(interaction.guild.id, raid.teamId);

  if (newMembers.length > 0 || membersToRemove.length > 0) {
    await interaction.editReply({
      content: `✅ Raid refreshed. Added ${newMembers.length} new member(s), removed ${membersToRemove.length} member(s).${teamSuffix(refreshTeamLabel)}`,
    });
  } else {
    await interaction.editReply({
      content: `✅ No roster changes needed.${teamSuffix(refreshTeamLabel)}`,
    });
  }
}

export default command;
