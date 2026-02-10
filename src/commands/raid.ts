import {
  SlashCommandBuilder,
  CommandInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  Guild,
} from 'discord.js';
import prisma from '../database/client';
import { Command } from '../types';
import { getSpecRole, getSpecSymbol, RoleComposition } from '../utils/wowData';
import { canManageRaids } from '../utils/permissions';
import { t, getTranslations } from '../utils/localization';
import { calculateRaidStats, calculateGuildStats } from '../utils/statsCalculator';
import type { AttendanceRecord } from '../utils/statsCalculator';
import { formatRaidStatsEmbed, formatGuildStatsEmbed } from '../utils/statsFormatter';
import { formatStatusEmbed } from '../utils/statusFormatter';
import { calculatePlayerStats, getPlayerRoleDistribution, getPlayerAttendanceHistory } from '../utils/attendanceAnalytics';
import { formatAttendanceEmbed } from '../utils/attendanceFormatter';
import { analyzeRaidComposition, findCompositionGaps, suggestPlayerSwaps, calculateSuccessLikelihood, CompositionAttendee } from '../utils/compositionAnalyzer';
import { formatCompositionEmbed } from '../utils/compositionFormatter';
import { formatRaidNotesEmbed } from '../utils/notesFormatter';
import { archiveRaid, unarchiveRaid, searchArchive } from '../utils/archiveManager';
import { formatArchiveSearchEmbed } from '../utils/archiveFormatter';
import { analyzeRaidFeedback, getGuildMorale } from '../utils/feedbackAnalyzer';
import { formatRaidFeedbackEmbed, formatGuildMoraleEmbed } from '../utils/feedbackFormatter';
import { pendingRaidCreations } from '../events/buttonHandler';
import { BadgeType } from '@prisma/client';
import { formatPlayerBadgesDetailed, getBadgeName, getBadgeEmoji } from '../utils/badgeFormatter';
import { awardManualBadge } from '../utils/badgeManager';

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

const data = new SlashCommandBuilder()
  .setName('raid')
  .setDescription('Manage raid events')
  .addSubcommand((subcommand) =>
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
          .setDescription('Discord roles for this raid (comma-separated role names or IDs)')
      )
      .addBooleanOption((option) =>
        option
          .setName('ping_roles')
          .setDescription('Whether to ping the raid roles when creating')
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('list')
      .setDescription('List upcoming raids')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('delete')
      .setDescription('Delete a raid')
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
      .setDescription('Close a raid to stop sign-ups')
      .addStringOption((option) =>
        option
          .setName('raid_id')
          .setDescription('The ID of the raid to close')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('cancel')
      .setDescription('Cancel a raid')
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
          .setDescription('Optional custom message to include in the reminder')
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('refresh')
      .setDescription('Refresh a raid roster')
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
      .setDescription('Edit a raid')
      .addStringOption((option) =>
        option
          .setName('raid_id')
          .setDescription('The ID of the raid to edit')
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('date')
          .setDescription('New raid date (YYYY-MM-DD)')
      )
      .addStringOption((option) =>
        option
          .setName('time')
          .setDescription('New raid time (HH:MM in 24h format)')
      )
      .addStringOption((option) =>
        option
          .setName('title')
          .setDescription('New raid title/name')
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('clone')
      .setDescription('Clone a raid with new date/time')
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
      )
      .addStringOption((option) =>
        option
          .setName('title')
          .setDescription('Override raid title/name')
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('stats')
      .setDescription('View raid attendance statistics')
      .addStringOption((option) =>
        option
          .setName('period')
          .setDescription('Time period for statistics')
          .addChoices(
            { name: 'Week', value: 'week' },
            { name: 'Month', value: 'month' },
            { name: 'Quarter', value: 'quarter' },
            { name: 'Year', value: 'year' },
            { name: 'All time', value: 'all' }
          )
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('status')
      .setDescription('View upcoming raid status dashboard')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('attendance')
      .setDescription('View player attendance history')
      .addUserOption((option) =>
        option
          .setName('player')
          .setDescription('The player to view attendance for')
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('period')
          .setDescription('Time period for attendance history')
          .addChoices(
            { name: '30 days', value: '30' },
            { name: '90 days', value: '90' },
            { name: 'All time', value: 'all' }
          )
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('suggest')
      .setDescription('Get composition suggestions for a raid')
      .addStringOption((option) =>
        option
          .setName('raid_id')
          .setDescription('The ID of the raid to analyze')
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
          .setDescription('The ID of the raid to view notes for')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('pin')
      .setDescription('Archive a raid')
      .addStringOption((option) =>
        option
          .setName('raid_id')
          .setDescription('The ID of the raid to archive')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('unpin')
      .setDescription('Restore an archived raid')
      .addStringOption((option) =>
        option
          .setName('raid_id')
          .setDescription('The ID of the raid to restore')
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
          .setDescription('Search query (raid name or player name)')
      )
      .addStringOption((option) =>
        option
          .setName('period')
          .setDescription('Time period to search')
          .addChoices(
            { name: 'Last 30 days', value: '30' },
            { name: 'Last 90 days', value: '90' },
            { name: 'Last year', value: '365' },
            { name: 'All time', value: 'all' }
          )
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('badges')
      .setDescription('View player badges')
      .addUserOption((option) =>
        option
          .setName('player')
          .setDescription('The player to view badges for')
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('award-badge')
      .setDescription('Award a badge to a player')
      .addUserOption((option) =>
        option
          .setName('player')
          .setDescription('The player to award the badge to')
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('badge')
          .setDescription('The badge type to award')
          .setRequired(true)
          .addChoices(
            { name: 'Perfect Attendance', value: 'PERFECT_ATTENDANCE' },
            { name: 'Tank Main', value: 'TANK_MAIN' },
            { name: 'Healer Hero', value: 'HEALER_HERO' },
            { name: 'Damage Dealer', value: 'DAMAGE_DEALER' },
            { name: 'Sharpshooter', value: 'SHARPSHOOTER' },
            { name: 'Always on Time', value: 'ALWAYS_ON_TIME' },
            { name: 'Early Bird', value: 'EARLY_BIRD' },
            { name: 'Team Player', value: 'TEAM_PLAYER' },
            { name: 'Reliable Member', value: 'RELIABLE_MEMBER' },
            { name: 'Rising Star', value: 'RISING_STAR' },
            { name: 'Veteran Raider', value: 'VETERAN_RAIDER' },
            { name: 'Leaders Choice', value: 'LEADERS_CHOICE' }
          )
      )
      .addStringOption((option) =>
        option
          .setName('reason')
          .setDescription('Reason for awarding the badge')
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('feedback')
      .setDescription('Analyze raid feedback')
      .addStringOption((option) =>
        option
          .setName('raid_id')
          .setDescription('The ID of the raid to analyze feedback for')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('morale')
      .setDescription('View guild morale trends')
      .addStringOption((option) =>
        option
          .setName('period')
          .setDescription('Time period for morale analysis')
          .addChoices(
            { name: '7 days', value: '7' },
            { name: '30 days', value: '30' },
            { name: '90 days', value: '90' }
          )
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents) as SlashCommandBuilder;

const command: Command = {
  data,
  execute: async (interaction: CommandInteraction) => {
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
    } else if (subcommand === 'stats') {
      await handleStatsCommand(interaction);
    } else if (subcommand === 'status') {
      await handleStatusCommand(interaction);
    } else if (subcommand === 'attendance') {
      await handleAttendanceCommand(interaction);
    } else if (subcommand === 'suggest') {
      await handleSuggestCommand(interaction);
    } else if (subcommand === 'notes') {
      await handleNotesCommand(interaction);
    } else if (subcommand === 'pin') {
      await handlePinCommand(interaction);
    } else if (subcommand === 'unpin') {
      await handleUnpinCommand(interaction);
    } else if (subcommand === 'search') {
      await handleSearchCommand(interaction);
    } else if (subcommand === 'badges') {
      await handleBadgesCommand(interaction);
    } else if (subcommand === 'award-badge') {
      await handleAwardBadgeCommand(interaction);
    } else if (subcommand === 'feedback') {
      await handleFeedbackCommand(interaction);
    } else if (subcommand === 'morale') {
      await handleMoraleCommand(interaction);
    }
  },
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
  const rolesInput = interaction.options.get('roles', false)?.value as string;
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

  // Determine which roles to use: custom roles from parameter, or guild defaults
  const effectiveRolesInput = rolesInput || guildData.raidRoles;
  
  if (!effectiveRolesInput || effectiveRolesInput.trim() === '') {
    await interaction.editReply({
      content: '❌ No raid roles configured. Either specify roles in the command or configure default roles with `/config raid-roles`.',
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
  // Parse the roles parameter (or use guild defaults)
  const roleIds = effectiveRolesInput.split(',').map((r: string) => r.trim()).filter(Boolean);

  if (roleIds.length === 0) {
    await interaction.editReply({
      content: '❌ No valid roles provided. Please specify at least one role or configure default roles with `/config raid-roles`.',
    });
    return;
  }

  let eligibleMembers = new Set<string>();

  // Fetch all members if not cached
  await interaction.guild.members.fetch();

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

  // Get user preferences for class/spec
  const userPrefs = await prisma.userPreference.findMany({
    where: {
      guildId: interaction.guild.id,
      userId: { in: Array.from(eligibleMembers) },
    },
  });

  const prefsMap = new Map<string, typeof userPrefs[0]>(userPrefs.map((p: typeof userPrefs[0]) => [p.userId, p]));

  // Check for duplicate raids within 1 hour window
  const existingRaid = await prisma.raid.findFirst({
    where: {
      guildId: interaction.guild.id,
      raidDate: {
        gte: new Date(raidDate.getTime() - 60 * 60 * 1000),
        lte: new Date(raidDate.getTime() + 60 * 60 * 1000)
      },
      status: { not: 'cancelled' }
    }
  });

  if (existingRaid) {
    // Generate confirmation ID
    const confirmationId = require('crypto').randomUUID();

    // Store pending data
    pendingRaidCreations.set(confirmationId, {
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      raidDate,
      title,
      roles: effectiveRolesInput,
      eligibleMembers,
      guildData,
      channel: interaction.channel
    });

    const confirmEmbed = new EmbedBuilder()
      .setTitle('⚠️ Raid Conflict Detected')
      .setDescription(`A raid already exists: "${existingRaid.description}" at ${existingRaid.raidDate.toLocaleString()}`)
      .setColor(0xffa500);

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`create_confirm_${confirmationId}`)
        .setLabel('Create Anyway')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`create_cancel_${confirmationId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
      embeds: [confirmEmbed],
      components: [buttons],
    });
    return;
  }

  // Create raid in database
  const raid = await prisma.raid.create({
    data: {
      guildId: interaction.guild.id,
      channelId: interaction.channel.id,
      raidDate,
      description: title,
      roles: effectiveRolesInput,
      createdBy: interaction.user.id,
    },
  });

  // Create attendance records for all eligible members with their saved class/spec
  const attendanceData = Array.from(eligibleMembers).map((userId) => {
    const member = interaction.guild!.members.cache.get(userId);
    const pref = prefsMap.get(userId);
    return {
      raidId: raid.id,
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

  // Send ephemeral confirmation to command user
  await interaction.editReply({
    content: `✅ Raid "${title}" created successfully with ${eligibleMembers.size} members!`,
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

  // Calculate role composition and sort by role
  const composition: RoleComposition = {
    tanks: 0,
    healers: 0,
    melee: 0,
    ranged: 0,
    noClass: 0,
  };

  // Sort attending by role: Tanks -> Healers -> Melee -> Ranged -> No class set
  const sortedAttending = attending.sort((a: typeof raid.attendance[0], b: typeof raid.attendance[0]) => {
    const roleA = getSpecRole(a.wowClass, a.wowSpec);
    const roleB = getSpecRole(b.wowClass, b.wowSpec);

    const roleOrder = { Tank: 0, Healer: 1, Melee: 2, Ranged: 3 };
    const orderA = roleA ? roleOrder[roleA] : 4;
    const orderB = roleB ? roleOrder[roleB] : 4;

    if (orderA !== orderB) return orderA - orderB;
    return a.username.localeCompare(b.username); // Secondary sort by name
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
  const dpsList: string[] = [];
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
    else if (role === 'Melee' || role === 'Ranged') dpsList.push(line);
    else noClassList.push(line);
  });

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

   const baseFields: { name: string; value: string; inline: boolean }[] = [
     { name: trans.raidStatus, value: raidStatusText, inline: true },
     { name: trans.dateAndTime, value: `<t:${timestamp}:F> (<t:${timestamp}:R>)`, inline: false },
   ];

   // Calculate total participants
   const totalParticipants = composition.tanks + composition.healers + composition.melee + composition.ranged + composition.noClass;
   
   // Add total participants field (spans full width)
   baseFields.push({ name: trans.totalParticipants, value: `**${totalParticipants}**`, inline: false });

   // 3-column layout: Tank | Healer | DPS
  const dpsCount = composition.melee + composition.ranged;
  
  const tankText = tankList.length > 0 
    ? tankList.join('\n') 
    : '\u200B';
  const healerText = healerList.length > 0 
    ? healerList.join('\n') 
    : '\u200B';
  const dpsText = dpsList.length > 0 
    ? dpsList.join('\n') 
    : '\u200B';

  baseFields.push(
    { name: `🛡️ ${trans.tank} (${composition.tanks})`, value: tankText, inline: true },
    { name: `💚 ${trans.heal} (${composition.healers})`, value: healerText, inline: true },
    { name: `⚔️ ${trans.dps} (${dpsCount})`, value: dpsText, inline: true }
  );

  // Add running late section below the 3-column layout
  if (runningLate.length > 0) {
    const lateText = runningLate.map((a: typeof raid.attendance[0]) => `${a.username}`).join('\n');
    baseFields.push({ name: `⏰ ${trans.runningLate} (${runningLate.length})`, value: lateText, inline: false });
  }

  // Add opted out section
  if (optedOut.length > 0) {
    const optedOutText = optedOut.map((a: typeof raid.attendance[0]) => {
      if (a.optoutReason) {
        return `${a.username} (${a.optoutReason})`;
      }
      return a.username;
    }).join('\n');
    baseFields.push({ name: `❌ ${trans.optedOut} (${optedOut.length})`, value: optedOutText, inline: false });
  }

  // Add no class section
  if (noClassList.length > 0) {
    const noClassText = noClassList.join('\n');
    baseFields.push({ name: `❓ ${trans.noClass} (${composition.noClass})`, value: noClassText, inline: false });
  }

  const embed = new EmbedBuilder()
    .setTitle(`${raid.description || trans.raidEvent}`)
    .setColor(embedColor)
    .addFields(...baseFields)
    .setFooter({ text: `${trans.raidId}: ${raid.id}` })
    .setTimestamp();

  return embed;
}

async function handleListRaids(interaction: ChatInputCommandInteraction) {
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

  if (raids.length === 0) {
    await interaction.editReply({
      content: '📅 No upcoming raids found.',
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('Upcoming Raids')
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
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
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

  await interaction.editReply({
    content: `✅ Raid "${raid.description}" has been deleted.`,
  });
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
      content: '❌ You do not have permission to close raids. Ask your server admin to configure raid leader roles.',
    });
    return;
  }

  const raidId = interaction.options.get('raid_id', true).value as string;

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

  if (raid.status === 'closed') {
    await interaction.editReply({
      content: '❌ This raid is already closed.',
    });
    return;
  }

  // Update raid status to closed
  await prisma.raid.update({
    where: { id: raidId },
    data: { status: 'closed' },
  });

  // Update the raid message
  if (raid.messageId && raid.channelId) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channelId);
      if (channel?.isTextBased() && 'messages' in channel) {
        const message = await channel.messages.fetch(raid.messageId);
        const embed = await createRaidEmbed(raidId, raid.guild.language);

        // Remove buttons when closed
        await message.edit({
          embeds: [embed],
          components: [],
        });
      }
    } catch (error) {
      console.error('Error updating raid message:', error);
    }
  }

  await interaction.editReply({
    content: t(raid.guild.language || 'en', 'raidClosedSuccess', { title: raid.description || 'Raid' }),
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
      content: '❌ You do not have permission to cancel raids. Ask your server admin to configure raid leader roles.',
    });
    return;
  }

  const raidId = interaction.options.get('raid_id', true).value as string;

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

  if (raid.status === 'cancelled') {
    await interaction.editReply({
      content: '❌ This raid is already cancelled.',
    });
    return;
  }

  // Update raid status to cancelled
  await prisma.raid.update({
    where: { id: raidId },
    data: { status: 'cancelled' },
  });

  // Update the raid message
  if (raid.messageId && raid.channelId) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channelId);
      if (channel?.isTextBased() && 'messages' in channel) {
        const message = await channel.messages.fetch(raid.messageId);
        const embed = await createRaidEmbed(raidId, raid.guild.language);

        // Remove buttons when cancelled
        await message.edit({
          embeds: [embed],
          components: [],
        });
      }
    } catch (error) {
      console.error('Error updating raid message:', error);
    }
  }

  await interaction.editReply({
    content: t(raid.guild.language || 'en', 'raidCancelledSuccess', { title: raid.description || 'Raid' }),
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
      content: '❌ You do not have permission to send raid reminders. Ask your server admin to configure raid leader roles.',
    });
    return;
  }

  const raidId = interaction.options.get('raid_id', true).value as string;
  const customMessage = interaction.options.get('message', false)?.value as string | undefined;

  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: {
      guild: true,
      attendance: true,
    },
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

  if (!raid.channelId) {
    await interaction.editReply({
      content: '❌ Could not find the raid channel.',
    });
    return;
  }

  const lang = raid.guild.language || 'en';
  const trans = getTranslations(lang);
  const timestamp = Math.floor(raid.raidDate.getTime() / 1000);

  // Get channel to send reminder
  const channel = await interaction.client.channels.fetch(raid.channelId);
  if (!channel?.isTextBased() || !('send' in channel)) {
    await interaction.editReply({
      content: '❌ Could not send reminder to raid channel.',
    });
    return;
  }

  // Get opted-out players for leader awareness
  const optedOut = raid.attendance.filter(
    (a: typeof raid.attendance[0]) => a.status === 'opted_out'
  );

  const reminderEmbed = new EmbedBuilder()
    .setTitle(trans.reminderTitle)
    .setColor(0xffa500)
    .setDescription(
      t(lang, 'reminderMessage', {
        title: raid.description || trans.raidEvent,
        timestamp: timestamp.toString(),
      })
    )
    .setFooter({ text: `${trans.raidId}: ${raid.id}` })
    .setTimestamp();

  // Add custom message prominently at top if provided
  if (customMessage) {
    // Truncate to Discord embed field value limit (1024 chars)
    const truncatedMessage = customMessage.length > 1024
      ? customMessage.substring(0, 1021) + '...'
      : customMessage;
    reminderEmbed.addFields({
      name: `📣 ${trans.customMessage}`,
      value: truncatedMessage,
      inline: false,
    });
  }

  // Show opted-out players so leader can see who's missing
  if (optedOut.length > 0) {
    const optedOutList = optedOut.map((a: typeof raid.attendance[0]) => a.username).join(', ');
    reminderEmbed.addFields({
      name: `❌ ${trans.optedOutPlayers} (${optedOut.length})`,
      value: optedOutList,
      inline: false,
    });
  }

  // Build role mentions from raid's configured roles
  const roleIds = raid.roles ? raid.roles.split(',').map((r: string) => r.trim()).filter(Boolean) : [];
  const roleMentions = buildRoleMentions(interaction.guild!, roleIds);

  // Send reminder mentioning the raid's roles
  await channel.send({
    content: roleMentions || '@everyone',
    embeds: [reminderEmbed],
  });

  await interaction.editReply({
    content: t(lang, 'raidReminderSent', { title: raid.description || 'Raid' }),
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
      content: '❌ You do not have permission to refresh raids. Ask your server admin to configure raid leader roles.',
    });
    return;
  }

  const raidId = interaction.options.get('raid_id', true).value as string;

  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: {
      guild: true,
      attendance: true,
    },
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

  const guildData = raid.guild;

  // Get members with raid roles (current eligible members)
  // Use raid-specific roles if available, otherwise fall back to guild defaults
  const roleSource = raid.roles && raid.roles.trim().length > 0
    ? raid.roles
    : guildData.raidRoles;
  const roleIds = roleSource.split(',').map((r: string) => r.trim()).filter(Boolean);

  let currentEligibleMembers = new Set<string>();

  if (roleIds.length > 0) {
    // Fetch all members if not cached
    await interaction.guild.members.fetch();

    for (const [memberId, guildMember] of interaction.guild.members.cache) {
      if (guildMember.user.bot) continue;

      const hasRaidRole = guildMember.roles.cache.some((role) =>
        roleIds.includes(role.id) || roleIds.includes(role.name)
      );

      if (hasRaidRole) {
        currentEligibleMembers.add(memberId);
      }
    }
  } else {
    // No roles configured, include all non-bot members
    await interaction.guild.members.fetch();
    for (const [memberId, guildMember] of interaction.guild.members.cache) {
      if (!guildMember.user.bot) {
        currentEligibleMembers.add(memberId);
      }
    }
  }
  
    // ============================================================
    // ROSTER COMPARISON: Find add/remove deltas
    // ============================================================
    // Simple set theory:
    // membersToAdd = (currently eligible) \ (currently in raid)
    // membersToRemove = (currently in raid) \ (currently eligible)
    
    const currentAttendance = raid.attendance;
    const currentAttendanceIds = new Set(currentAttendance.map((a: typeof raid.attendance[0]) => a.userId));
  
    // Members who are eligible but not yet in attendance
    const membersToAdd = Array.from(currentEligibleMembers).filter(
      (memberId) => !currentAttendanceIds.has(memberId)
    );
  
    // Members in attendance but no longer eligible (lost role)
    const membersToRemove = currentAttendance.filter(
      (a: typeof raid.attendance[0]) => !currentEligibleMembers.has(a.userId)
    );
  
    // ============================================================
    // DATABASE UPDATE 2: Ensure UserPreference records exist for new members
    // ============================================================
    // UserPreference is a foreign key requirement for RaidAttendance.
    // Every member in raid must have a UserPreference record, even if empty.
    // This upsert ensures the record exists; we'll use it to fetch class/spec.
    //
    // Why upsert (not insert)?
    // - Member might already have UserPreference from previous raids
    // - Member might have set class/spec manually with /class command
    // - If record exists, we update username (in case they changed display name)
    // - If doesn't exist, we create it
    
    for (const userId of membersToAdd) {
      const guildMember = interaction.guild.members.cache.get(userId);
      if (guildMember) {
        await prisma.userPreference.upsert({
          where: {
            userId_guildId: {
              userId,
              guildId: interaction.guild.id,
            },
          },
          update: {
            username: guildMember.displayName,
          },
          create: {
            userId,
            guildId: interaction.guild.id,
            username: guildMember.displayName,
          },
        });
      }
    }
  
    // ============================================================
    // DATABASE READ: Fetch UserPreferences for new members
    // ============================================================
    // Now that we've ensured UserPreference exists, fetch them all at once.
    // This is batch query efficiency: one DB call for all, not N+1 calls.
    // We'll use these to populate class/spec for new attendance records.
    
    const newMemberIds = Array.from(membersToAdd);
    const userPrefs = await prisma.userPreference.findMany({
      where: {
        guildId: interaction.guild.id,
        userId: { in: newMemberIds },
      },
    });
    
    // Create map for O(1) lookup during attendance creation
    // Map: userId → UserPreference object
    const prefsMap = new Map(userPrefs.map(pref => [pref.userId, pref]));
  
    // ============================================================
    // DATABASE UPDATE 3: Create attendance records for new members
    // ============================================================
    // Build attendance objects for batch insert. Each new member gets:
    // - status: "attending" (default, they haven't responded yet)
    // - wowClass/wowSpec: Pulled from UserPreference if available, else null
    //
    // Why "attending" as default?
    // - Forces member to confirm their attendance explicitly
    // - Gives fresh engagement signal
    // - Alternative (preserving old status) was rejected because it's confusing
    //   if a member left, loses role, regains role, they should re-confirm
    //
    // See: docs/architecture/raid-edit-limitations.md - "Member Status Changes Lost on Removal"
    
    const attendanceData = newMemberIds
      .map((userId) => {
        const guildMember = interaction.guild!.members.cache.get(userId);
        if (!guildMember) return null;
        
        const pref = prefsMap.get(userId);
        return {
          raidId: raid.id,
          userId,
          guildId: interaction.guild!.id,
          username: guildMember.displayName,
          status: 'attending' as const,
          wowClass: pref?.wowClass || null,
          wowSpec: pref?.wowSpec || null,
        };
      })
      .filter((data) => data !== null);
  
    // Batch insert new attendance records (more efficient than loop + individual inserts)
    if (attendanceData.length > 0) {
      await prisma.raidAttendance.createMany({
        data: attendanceData,
      });
    }
  
    // ============================================================
    // DATABASE UPDATE 4: Remove ineligible members
    // ============================================================
    // Delete attendance records for members who lost their raid role.
    // This cascades and removes any related data (their responses, late status, etc.).
    //
    // Why complete deletion?
    // - Clean state: no ambiguity about whether member was once invited
    // - If they regain role, they start fresh (see design decision above)
    // - Audit trail: can check raid creation message to see original roster
    
    if (membersToRemove.length > 0) {
      const memberIdsToRemove = membersToRemove.map(attendance => attendance.id);
      await prisma.raidAttendance.deleteMany({
        where: {
          id: { in: memberIdsToRemove },
        },
      });
    }

  // Update the raid embed
  if (raid.messageId && raid.channelId) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channelId);
      if (channel?.isTextBased() && 'messages' in channel) {
        const message = await channel.messages.fetch(raid.messageId);
        const embed = await createRaidEmbed(raid.id, guildData.language);
        
        // Get translations for button labels
        const trans = getTranslations(guildData.language);

        // Recreate buttons with translated labels
        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`raid_optout_${raid.id}`)
            .setLabel(trans.optOut)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(raid.status !== 'open'),
          new ButtonBuilder()
            .setCustomId(`raid_optin_${raid.id}`)
            .setLabel(trans.optIn)
            .setStyle(ButtonStyle.Success)
            .setDisabled(raid.status !== 'open'),
          new ButtonBuilder()
            .setCustomId(`raid_late_${raid.id}`)
            .setLabel(trans.runningLateButton)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(raid.status !== 'open'),
          new ButtonBuilder()
            .setCustomId(`raid_class_${raid.id}`)
            .setLabel(trans.setClassSpec)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(raid.status !== 'open')
        );

        await message.edit({ embeds: [embed], components: [buttons] });
      }
    } catch (error) {
      console.error('Failed to update raid message:', error);
    }
  }

  const addedCount = membersToAdd.length;
  const removedCount = membersToRemove.length;

  let statusMessage = '✅ Raid refreshed successfully!';
  if (addedCount > 0 || removedCount > 0) {
    statusMessage += `\n- Added ${addedCount} new member(s)\n- Removed ${removedCount} ineligible member(s)`;
  } else {
    statusMessage += '\nNo roster changes needed.';
  }

   await interaction.editReply({
     content: statusMessage,
   });
 }
 
  /**
   * Validate date string matches YYYY-MM-DD format
   * @returns Error message or null if valid
   */
  function validateDateFormat(dateStr: string): string | null {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) {
      return '❌ Date must be in YYYY-MM-DD format (e.g., 2025-12-25)';
    }
    
    const [year, month, day] = dateStr.split('-').map(Number);
    if (month < 1 || month > 12) {
      return '❌ Invalid month. Month must be between 01 and 12.';
    }
    if (day < 1 || day > 31) {
      return '❌ Invalid day. Day must be between 01 and 31.';
    }
    
    // Additional validation: check if date is actually valid (e.g., not 2025-02-30)
    const testDate = new Date(`${dateStr}T00:00:00`);
    if (isNaN(testDate.getTime())) {
      return '❌ Invalid date. This date does not exist (e.g., February 30th).';
    }
    
    return null;
  }

  /**
   * Validate time string matches HH:MM format with valid hours/minutes
   * @returns Error message or null if valid
   */
  function validateTimeFormat(timeStr: string): string | null {
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(timeStr)) {
      return '❌ Time must be in HH:MM format (24-hour, e.g., 19:30)';
    }
    
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (hours < 0 || hours > 23) {
      return '❌ Invalid hour. Hours must be between 00 and 23.';
    }
    if (minutes < 0 || minutes > 59) {
      return '❌ Invalid minute. Minutes must be between 00 and 59.';
    }
    
    return null;
  }

  /**
   * Handle the /raid edit subcommand
   * 
   * Allows raid leaders to update raid date, time, title, and automatically maintains
   * roster accuracy by scanning current guild members and comparing against raid roles.
   * 
   * @param interaction - Discord slash command interaction
   * @returns void (sends response via interaction.editReply)
   * 
   * Flow:
   * 1. Validate guild/channel context
   * 2. Check permissions (canManageRaids)
   * 3. Extract and validate parameters (raid_id, date, time, title)
   * 4. Validate date/time format (YYYY-MM-DD, HH:MM)
   * 5. Fetch raid and validate state (exists, belongs to guild, is open)
   * 6. Parse date/time with timezone conversion to UTC
   * 7. Build change summary and update raid in database
   * 8. Scan guild members and update roster (add new, remove ineligible)
   * 9. Update embed message in Discord (if exists and accessible)
   * 10. Send detailed response to user
   * 
   * See: docs/maintainers/handleEditRaid.md for detailed implementation guide
   * See: docs/architecture/raid-edit-api-contract.md for API contract
   */
  async function handleEditRaid(interaction: ChatInputCommandInteraction) {
    // ============================================================
    // VALIDATION 0: Basic context checks (guild/channel existence)
    // ============================================================
    // Slash commands can be used outside servers (DMs); we need Discord context
    // to fetch guild members, access channels, and store guild-specific data.
    if (!interaction.guild || !interaction.channel) {
      await interaction.reply({
        content: '❌ This command can only be used in a server!',
        ephemeral: true,
      });
      return;
    }
  
    // Defer reply to allow time for long operations (member fetching, DB updates)
    // ephemeral: true keeps bot logs clean (only user sees response)
    await interaction.deferReply({ ephemeral: true });
  
    // ============================================================
    // VALIDATION 1: Permission check (canManageRaids)
    // ============================================================
    // Only raid leaders should edit raids. Uses consistent permission check
    // with other raid management commands (create, delete, close, etc.)
    // This prevents regular members from modifying raid state.
    const member = interaction.member;
    if (!member || !(await canManageRaids(member as any))) {
      await interaction.editReply({
        content: '❌ You do not have permission to edit raids. Ask your server admin to configure raid leader roles.',
      });
      return;
    }
  
    // ============================================================
    // VALIDATION 2: Extract command parameters from Discord interaction
    // ============================================================
    // raid_id: Required, identifies which raid to edit
    // date/time/title: Optional, can update any combination of these
    // Using optional chaining (?.) prevents crashes if optional params not provided
    const raidId = interaction.options.get('raid_id', true).value as string;
    const dateStr = interaction.options.get('date', false)?.value as string | undefined;
    const timeStr = interaction.options.get('time', false)?.value as string | undefined;
    const title = interaction.options.get('title', false)?.value as string | undefined;
  
    // ============================================================
    // VALIDATION 3: At least one parameter must change
    // ============================================================
    // Prevents: /raid edit raid_id:abc (no changes)
    // Requires: /raid edit raid_id:abc date:2025-12-25 OR time:20:00 OR title:"New Title"
    // This check happens early before any database operations.
    if (!dateStr && !timeStr && !title) {
      await interaction.editReply({
        content: '❌ At least one of date, time, or title must be provided.',
      });
      return;
    }

    // ============================================================
    // VALIDATION 4: Date/Time Format Validation
    // ============================================================
    // Early validation of format is cheap and provides immediate feedback to user.
    // These helpers check:
    // - validateDateFormat(): YYYY-MM-DD pattern, valid month (01-12), valid day (01-31)
    // - validateTimeFormat(): HH:MM pattern, valid hours (00-23), valid minutes (00-59)
    // Format validation happens BEFORE we do any database work.
    if (dateStr) {
      const dateError = validateDateFormat(dateStr);
      if (dateError) {
        await interaction.editReply({ content: dateError });
        return;
      }
    }

    if (timeStr) {
      const timeError = validateTimeFormat(timeStr);
      if (timeError) {
        await interaction.editReply({ content: timeError });
        return;
      }
    }
  
    // ============================================================
    // VALIDATION 5: Comprehensive Raid State Validation
    // ============================================================
    // Fetch the raid from database with all related data we'll need:
    // - guild: Contains timezone offset and language settings
    // - attendance: List of current members for roster comparison
    const raid = await prisma.raid.findUnique({
      where: { id: raidId },
      include: {
        guild: true,
        attendance: true,
      },
    });
  
    // Raid must exist
    if (!raid) {
      await interaction.editReply({
        content: '❌ Raid not found.',
      });
      return;
    }
  
    // Guild isolation: Raid must belong to the guild that's running this command.
    // This is a critical security check—prevents editing raids from other guilds.
    if (raid.guildId !== interaction.guild.id) {
      await interaction.editReply({
        content: '❌ This raid does not belong to this server.',
      });
      return;
    }
  
    // Only open raids can be edited. Closed and cancelled raids are finalized.
    // Design: Immutable closed raids preserve audit trail and prevent accidents.
    if (raid.status === 'closed' || raid.status === 'cancelled') {
      await interaction.editReply({
        content: `❌ Cannot edit a ${raid.status} raid. Please contact an admin if you need to modify it.`,
      });
      return;
    }

    // Warn if message or channel ID is missing, but allow edit to proceed.
    // Reason: Database changes are still valuable even if embed can't update.
    // User can later use /raid refresh to send a new embed with correct messageId.
    if (!raid.messageId) {
      // TODO: Consider collecting warnings instead of immediately replying
      // Current: Reply is overwritten by final response anyway
    }

    if (!raid.channelId) {
      // TODO: Consider collecting warnings instead of immediately replying
      // Current: Reply is overwritten by final response anyway
    }
  
    const guildData = raid.guild;
    const updateData: any = {};
    const changes: string[] = [];
    let newRaidDate: Date | null = null;
  
    // ============================================================
    // VALIDATION 6 & 7: Parse & validate date/time, apply timezone conversion
    // ============================================================
    // CRITICAL TIMEZONE LOGIC:
    // User enters local time (e.g., "2025-12-25 19:30" for UTC+2 timezone)
    // Step 1: Parse as UTC naive date: "2025-12-25T19:30:00Z" (incorrect UTC)
    // Step 2: Subtract offset: 19:30 - 2 hours = 17:30 UTC (correct storage)
    // Step 3: When displayed to user via Discord timestamps, Discord auto-converts back to their tz
    //
    // Example: User in UTC+2 timezone enters 19:30
    // Store: 2025-12-25T17:30:00Z (UTC)
    // Display to user: <t:timestamp:F> → "2025-12-25 19:30" (Discord auto-adjusts)
    //
    // Rationale: Single UTC storage point + Discord's timestamp auto-formatting
    // handles multi-timezone guilds correctly.
    if (dateStr || timeStr) {
      // If only date provided, keep existing time; if only time provided, keep existing date
      // This allows: /raid edit raid_id:abc time:20:00 (keep same date)
      const existingDate = new Date(raid.raidDate);
      const finalDateStr = dateStr || existingDate.toISOString().split('T')[0];
      const finalTimeStr = timeStr || existingDate.toISOString().substring(11, 16);
  
      // Parse user's local time as UTC (temporarily)
      const dateTimeStr = `${finalDateStr}T${finalTimeStr}:00`;
      const localDate = new Date(dateTimeStr);
  
      // Apply timezone offset: subtract offset hours to convert to UTC
      // WARNING: This direction (subtract) is critical. Adding would give wrong time.
      // For UTC+2, we subtract 2 hours to go from local to UTC.
      const timezoneOffsetHours = guildData.timezoneOffset || 0;
      newRaidDate = new Date(localDate.getTime() - (timezoneOffsetHours * 60 * 60 * 1000));
  
      // Validate the resulting date is valid (NaN check after math)
      if (isNaN(newRaidDate.getTime())) {
        await interaction.editReply({
          content: '❌ Invalid date or time format. Use YYYY-MM-DD for date and HH:MM for time.',
        });
        return;
      }
  
      // Raid cannot be scheduled in the past (already happened or happening now)
      const now = new Date();
      if (newRaidDate < now) {
        await interaction.editReply({
          content: '❌ Raid date must be in the future.',
        });
        return;
      }

      // Prevent dates too far in future (likely typos: 3000 instead of 2025)
      // Limit: 2 years from now
      const maxFutureDate = new Date(now.getTime() + (2 * 365.25 * 24 * 60 * 60 * 1000));
      if (newRaidDate > maxFutureDate) {
        await interaction.editReply({
          content: '❌ Raid date too far in future. Please schedule within 2 years.',
        });
        return;
      }
  
      // Only record change if date/time actually changed (avoid unnecessary DB writes)
      // Compare as milliseconds, not Date object references
      if (newRaidDate.getTime() !== raid.raidDate.getTime()) {
        updateData.raidDate = newRaidDate;
        // Discord timestamp formatter: <t:unix_seconds:F> (full date and time)
        changes.push(`Date/time updated to <t:${Math.floor(newRaidDate.getTime() / 1000)}:F>`);
      }
    }
  
    // Title update: only record if actually changed
    if (title && title !== raid.description) {
      updateData.description = title;
      changes.push(`Title updated to "${title}"`);
    }
  
    // ============================================================
    // VALIDATION 8: Handle edge case - No changes requested
    // ============================================================
    // If user provided parameters but nothing actually changed
    // (e.g., /raid edit raid_id:abc time:19:30 when time already 19:30)
    // We should reject to avoid confusing "success" with no effect.
    if (changes.length === 0) {
      await interaction.editReply({
        content: '❌ No changes requested. Please specify at least one new value that differs from current.',
      });
      return;
    }
  
    // ============================================================
    // DATABASE UPDATE 1: Update raid date/time/title
    // ============================================================
    // This update is atomic at database level.
    // Note: We deliberately do NOT update raid.roles (immutable by design).
    // See: docs/architecture/raid-edit-limitations.md - "Raid Roles Are Immutable"
    await prisma.raid.update({
      where: { id: raidId },
      data: updateData,
    });
  
  
    // ============================================================
    // MEMBER SCANNING ALGORITHM: Find current eligible members
    // ============================================================
    // This section determines which guild members should be in the raid
    // based on current role assignments. Algorithm:
    //
    // 1. Determine which roles apply to this raid (specific or guild default)
    // 2. Fetch all guild members
    // 3. For each member, check if they have ANY of the raid roles
    // 4. Build set of currently eligible users
    //
    // Why this matters: When you edit a raid, members may have joined/left
    // the guild, or gained/lost raid roles. We need to keep roster accurate.
    //
    // Related: /raid refresh does this same operation without editing raid
    
    // Determine role source: raid-specific roles OR guild defaults
    // Raid roles are immutable, so we use raid.roles here
    // (If roles were edited in future, this would change to use newRoles)
    const roleSource = raid.roles && raid.roles.trim().length > 0
      ? raid.roles
      : guildData.raidRoles;
    const roleIds = roleSource.split(',').map((r: string) => r.trim()).filter(Boolean);
  
    let currentEligibleMembers = new Set<string>();
    let rosterScanError: string | null = null;
  
    try {
      if (roleIds.length > 0) {
        // Roles are configured; scan for members with these specific roles
        
        // CRITICAL: fetch() ensures cache is complete
        // Without fetch(), cache might only contain members who joined recently
        // For accuracy, we always do a full fetch here.
        // Performance note: This can take 500ms+ for large guilds (100K+ members)
        await interaction.guild.members.fetch();
    
        for (const [memberId, guildMember] of interaction.guild.members.cache) {
          // Skip bots (never eligible for raids)
          if (guildMember.user.bot) continue;
    
          // Check if member has ANY of the raid roles (by ID or by name)
          // Supports both: role IDs ("123456") and role names ("Raider")
          const hasRaidRole = guildMember.roles.cache.some((role) =>
            roleIds.includes(role.id) || roleIds.includes(role.name)
          );
    
          if (hasRaidRole) {
            currentEligibleMembers.add(memberId);
          }
        }
      } else {
        // No roles configured; include all non-bot members
        // This is a fallback for guilds without specific raid roles
        await interaction.guild.members.fetch();
        for (const [memberId, guildMember] of interaction.guild.members.cache) {
          if (!guildMember.user.bot) {
            currentEligibleMembers.add(memberId);
          }
        }
      }

      // Edge case: No eligible members found, but roles ARE configured
      // This might happen if someone deleted all the raid roles from guild
      // We warn but continue—user might want to manually manage roster
      if (currentEligibleMembers.size === 0 && roleIds.length > 0) {
        rosterScanError = `⚠️ No eligible members found with configured roles. Roster not updated.`;
      }
    } catch (error) {
      // Member fetch can fail: Discord API timeout, intents missing, etc.
      // We catch it, log it, and continue with partial roster update
      console.error('Error during member scanning:', error);
      rosterScanError = '⚠️ Could not scan member roster due to an error. Database changes saved.';
    }
  
    // Get current attendance records
    const currentAttendance = raid.attendance;
    const currentAttendanceIds = new Set(currentAttendance.map((a: typeof raid.attendance[0]) => a.userId));
  
    // Find members to add (eligible but not in attendance)
    const membersToAdd = Array.from(currentEligibleMembers).filter(
      (memberId) => !currentAttendanceIds.has(memberId)
    );
  
    // Find members to remove (in attendance but not eligible)
    const membersToRemove = currentAttendance.filter(
      (a: typeof raid.attendance[0]) => !currentEligibleMembers.has(a.userId)
    );
  
    // Ensure all new members have UserPreference records
    for (const userId of membersToAdd) {
      const guildMember = interaction.guild.members.cache.get(userId);
      if (guildMember) {
        await prisma.userPreference.upsert({
          where: {
            userId_guildId: {
              userId,
              guildId: interaction.guild.id,
            },
          },
          update: {
            username: guildMember.displayName,
          },
          create: {
            userId,
            guildId: interaction.guild.id,
            username: guildMember.displayName,
          },
        });
      }
    }
  
    // Fetch all user preferences for new members
    const newMemberIds = Array.from(membersToAdd);
    const userPrefs = await prisma.userPreference.findMany({
      where: {
        guildId: interaction.guild.id,
        userId: { in: newMemberIds },
      },
    });
    
    // Create a map for quick lookup
    const prefsMap = new Map(userPrefs.map(pref => [pref.userId, pref]));
  
    // Build attendance data for batch insert
    const attendanceData = newMemberIds
      .map((userId) => {
        const guildMember = interaction.guild!.members.cache.get(userId);
        if (!guildMember) return null;
        
        const pref = prefsMap.get(userId);
        return {
          raidId: raid.id,
          userId,
          guildId: interaction.guild!.id,
          username: guildMember.displayName,
          status: 'attending' as const,
          wowClass: pref?.wowClass || null,
          wowSpec: pref?.wowSpec || null,
        };
      })
      .filter((data) => data !== null);
  
    // Batch insert new attendance records
    if (attendanceData.length > 0) {
      await prisma.raidAttendance.createMany({
        data: attendanceData,
      });
    }
  
    // Batch delete removed members
    if (membersToRemove.length > 0) {
      const memberIdsToRemove = membersToRemove.map(attendance => attendance.id);
      await prisma.raidAttendance.deleteMany({
        where: {
          id: { in: memberIdsToRemove },
        },
      });
    }
  
  
    // ============================================================
    // EMBED UPDATE: Refresh raid message in Discord
    // ============================================================
    // Strategy: Edit message in place (don't re-send or move)
    // Why in-place edit?
    // - Preserves message history and edit history
    // - No new notifications/pings to members
    // - Single message in channel (not duplicates)
    // - Discord shows edit indication to users
    //
    // Non-critical operation: If this fails, database changes are already done.
    // We collect error status and report it to user, but don't fail the whole operation.
    //
    // See: docs/architecture/raid-edit-limitations.md - "Silent Embed Updates (No Re-ping)"
    
    let embedUpdateStatus = '';
    if (raid.messageId && raid.channelId) {
      try {
        // Step 1: Fetch the channel where raid message lives
        const channel = await interaction.client.channels.fetch(raid.channelId);
        if (channel?.isTextBased() && 'messages' in channel) {
          try {
            // Step 2: Fetch the specific raid message
            const message = await channel.messages.fetch(raid.messageId);
            
            // Step 3: Create new embed with updated data (roster may have changed)
            // Uses createRaidEmbed() which queries the DB and builds the visual
            const embed = await createRaidEmbed(raid.id, guildData.language);

            // Step 4: Get button labels in guild's language (for localization)
            const trans = getTranslations(guildData.language);
    
            // Step 5: Recreate buttons with updated disabled states
            // Buttons are disabled if raid is closed (already handled by status check earlier)
            // but we include this for consistency with refresh/create operations
            const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`raid_optout_${raid.id}`)
                .setLabel(trans.optOut)
                .setStyle(ButtonStyle.Danger)
                .setDisabled(raid.status !== 'open'),
              new ButtonBuilder()
                .setCustomId(`raid_optin_${raid.id}`)
                .setLabel(trans.optIn)
                .setStyle(ButtonStyle.Success)
                .setDisabled(raid.status !== 'open'),
              new ButtonBuilder()
                .setCustomId(`raid_late_${raid.id}`)
                .setLabel(trans.runningLateButton)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(raid.status !== 'open'),
              new ButtonBuilder()
                .setCustomId(`raid_class_${raid.id}`)
                .setLabel(trans.setClassSpec)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(raid.status !== 'open')
            );
    
            // Step 6: Edit message with new embed and buttons (in-place, no re-ping)
            await message.edit({ embeds: [embed], components: [buttons] });
            embedUpdateStatus = '✓ Embed updated';
          } catch (messageError) {
            // Message fetch or edit failed (message deleted, permissions lost, etc.)
            // This is non-critical; database already updated
            console.error('Error fetching raid message:', messageError);
            embedUpdateStatus = '⚠️ Could not fetch/update embed message (it may have been deleted)';
          }
        } else {
          // Channel exists but isn't text-based (voice channel? archive?)
          console.error('Channel is not text-based or does not support messages');
          embedUpdateStatus = '⚠️ Could not access channel to update embed';
        }
      } catch (channelError) {
        // Channel fetch failed (deleted channel, no permissions, etc.)
        console.error('Error fetching channel:', channelError);
        embedUpdateStatus = '⚠️ Could not access channel (may have been deleted or no permissions)';
      }
    } else if (!raid.messageId) {
      embedUpdateStatus = '⚠️ Cannot update raid embed: message ID not found';
    } else if (!raid.channelId) {
      embedUpdateStatus = '⚠️ Cannot update raid embed: channel ID not found';
    }
  
    // ============================================================
    // BUILD DETAILED USER RESPONSE
    // ============================================================
    // We've completed the entire operation. Now build a comprehensive response
    // showing what changed, roster modifications, embed status, and any warnings.
    // 
    // Structure: Main result → Field changes → Roster changes → Embed status → Metadata
    // This hierarchical approach makes it easy for user to scan key info.
    //
    // Format example:
    // ✅ Raid updated successfully!
    // **Updated Fields:**
    // • Date/time updated to <timestamp>
    // • Title updated to "New Title"
    // **Roster Changes:**
    // • Added 2 member(s)
    // • Removed 1 member(s)
    // **Embed Status:** ✓ Embed updated
    // **Raid ID:** `abc123`
    // **New Timestamp:** <t:unix:F>
    
    let finalMessage = '✅ Raid updated successfully!\n\n';

    // Section 1: What fields changed (always shown)
    finalMessage += '**Updated Fields:**\n';
    if (changes.length > 0) {
      finalMessage += changes.map(c => `• ${c}`).join('\n');
    }

    // Section 2: Roster modifications (if any)
    const addedCount = membersToAdd.length;
    const removedCount = membersToRemove.length;
    if (addedCount > 0 || removedCount > 0) {
      finalMessage += '\n\n**Roster Changes:**\n';
      if (addedCount > 0) finalMessage += `• Added ${addedCount} member(s)\n`;
      if (removedCount > 0) finalMessage += `• Removed ${removedCount} member(s)`;
    }

    // Section 3: Embed update status (helps user debug if embed didn't update)
    if (embedUpdateStatus) {
      finalMessage += `\n\n**Embed Status:** ${embedUpdateStatus}`;
    }

    // Section 4: Any roster scanning errors (non-critical, DB already updated)
    if (rosterScanError) {
      finalMessage += `\n\n${rosterScanError}`;
    }

    // Section 5: Metadata for reference and debugging
    finalMessage += `\n\n**Raid ID:** \`${raid.id}\``;
    if (newRaidDate) {
      const timestamp = Math.floor(newRaidDate.getTime() / 1000);
      finalMessage += `\n**New Timestamp:** <t:${timestamp}:F>`;
    }
  
    // Send the final response to the user
    await interaction.editReply({
      content: finalMessage,
    });
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

  // Get guild data for language
  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  if (!guildData) {
    await interaction.editReply({
      content: '❌ Guild not found in database. Please try again.',
    });
    return;
  }

  const lang = guildData.language || 'en';
  const trans = getTranslations(lang);

  // Fetch all open raids for this guild ordered by date, limit to 7
  const now = new Date();
  const raids = await prisma.raid.findMany({
    where: {
      guildId: interaction.guild.id,
      status: 'open',
      raidDate: { gte: now },
    },
    orderBy: { raidDate: 'asc' },
    take: 7,
    include: { attendance: true },
  });

  if (raids.length === 0) {
    await interaction.editReply({
      content: trans.statusNoUpcomingRaids,
    });
    return;
  }

  const statusRaids = raids.map((r) => ({
    id: r.id,
    description: r.description,
    raidDate: r.raidDate,
    status: r.status,
    attendance: r.attendance.map((a) => ({
      status: a.status,
      wowClass: a.wowClass,
      wowSpec: a.wowSpec,
    })),
  }));

  const embed = formatStatusEmbed(statusRaids, lang);

  await interaction.editReply({ embeds: [embed] });
}

async function handleStatsCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const raidId = interaction.options.get('raid_id', false)?.value as string | undefined;
  const period = (interaction.options.get('period', false)?.value as string) || 'month';

  // Get guild data for language
  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  if (!guildData) {
    await interaction.editReply({
      content: '❌ Guild not found in database. Please try again.',
    });
    return;
  }

  const lang = guildData.language || 'en';
  const trans = getTranslations(lang);

  if (raidId) {
    // Single raid stats
    const raid = await prisma.raid.findUnique({
      where: { id: raidId },
      include: { attendance: true },
    });

    if (!raid) {
      await interaction.editReply({ content: trans.raidNotFound });
      return;
    }

    if (raid.guildId !== interaction.guild.id) {
      await interaction.editReply({ content: trans.raidNotInServer });
      return;
    }

    const attendance: AttendanceRecord[] = raid.attendance.map((a) => ({
      userId: a.userId,
      username: a.username,
      status: a.status,
      wowClass: a.wowClass,
      wowSpec: a.wowSpec,
    }));

    const stats = calculateRaidStats(attendance);
    const embed = formatRaidStatsEmbed(
      { id: raid.id, description: raid.description },
      stats,
      lang,
    );

    await interaction.editReply({ embeds: [embed] });
  } else {
    // Guild-wide stats
    const now = new Date();
    let startDate: Date;

    if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'all') {
      startDate = new Date(0);
    } else {
      // default: month
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const raids = await prisma.raid.findMany({
      where: {
        guildId: interaction.guild.id,
        raidDate: { gte: startDate },
      },
      include: { attendance: true },
      orderBy: { raidDate: 'desc' },
    });

    if (raids.length === 0) {
      await interaction.editReply({ content: trans.statsNoRaidsFound });
      return;
    }

    const raidData = raids.map((r) => ({
      id: r.id,
      attendance: r.attendance.map((a) => ({
        userId: a.userId,
        username: a.username,
        status: a.status,
        wowClass: a.wowClass,
        wowSpec: a.wowSpec,
      })),
    }));

    const guildStats = calculateGuildStats(raidData);
    const embed = formatGuildStatsEmbed(guildStats, period, lang);

    await interaction.editReply({ embeds: [embed] });
  }
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

  const targetUser = interaction.options.getUser('player', true);
  const period = (interaction.options.get('period', false)?.value as string) || 'month';

  // Get guild data for language
  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  if (!guildData) {
    await interaction.editReply({
      content: '❌ Guild not found in database. Please try again.',
    });
    return;
  }

  const lang = guildData.language || 'en';
  const trans = getTranslations(lang);

  // Validate player exists in guild
  const playerPref = await prisma.userPreference.findUnique({
    where: {
      userId_guildId: {
        userId: targetUser.id,
        guildId: interaction.guild.id,
      },
    },
  });

  if (!playerPref) {
    await interaction.editReply({
      content: t(lang, 'attendancePlayerNotFound', { player: targetUser.username }),
    });
    return;
  }

  // Calculate stats
  const stats = await calculatePlayerStats(targetUser.id, interaction.guild.id, period);
  const roleDistribution = await getPlayerRoleDistribution(targetUser.id, interaction.guild.id);
  const history = await getPlayerAttendanceHistory(targetUser.id, interaction.guild.id, period);

  // Build embed
  const embed = formatAttendanceEmbed(
    targetUser.username,
    stats,
    roleDistribution,
    history.slice(0, 5), // Last 5 raids
    period,
    lang,
  );

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

  const raidId = interaction.options.getString('raid_id', true);

  // Get guild data for language
  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  if (!guildData) {
    await interaction.editReply({
      content: '❌ Guild not found in database. Please try again.',
    });
    return;
  }

  const lang = guildData.language || 'en';
  const trans = getTranslations(lang);

  // Fetch raid with attendance
  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: {
      attendance: true,
    },
  });

  if (!raid) {
    await interaction.editReply({
      content: `❌ ${t(lang, 'raidNotFound')}`,
    });
    return;
  }

  if (raid.guildId !== interaction.guild.id) {
    await interaction.editReply({
      content: '❌ This raid does not belong to your guild.',
    });
    return;
  }

  // Convert attendance to composition format
  const attendees: CompositionAttendee[] = raid.attendance.map((a) => ({
    userId: a.userId,
    username: a.username,
    status: a.status,
    wowClass: a.wowClass,
    wowSpec: a.wowSpec,
  }));

  // Analyze composition
  const analysis = analyzeRaidComposition(attendees);
  const gaps = findCompositionGaps(attendees);
  const suggestions = suggestPlayerSwaps(attendees, gaps);
  const likelihood = calculateSuccessLikelihood(attendees);

  // Build embed
  const raidName = raid.description || `Raid on ${raid.raidDate.toLocaleDateString(lang)}`;
  const embed = formatCompositionEmbed(
    raidName,
    analysis,
    gaps,
    suggestions,
    likelihood,
    lang,
  );

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

  const raidId = interaction.options.getString('raid_id', true);

  // Get guild data for language
  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  if (!guildData) {
    await interaction.editReply({
      content: '❌ Guild not found in database. Please try again.',
    });
    return;
  }

  const lang = guildData.language || 'en';
  const trans = getTranslations(lang);

  // Fetch raid with attendance notes
  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: {
      attendance: {
        where: {
          OR: [
            { playerNote: { not: null } },
            { optoutReason: { not: null } },
          ],
        },
      },
    },
  });

  if (!raid) {
    await interaction.editReply({
      content: `❌ ${t(lang, 'raidNotFound')}`,
    });
    return;
  }

  if (raid.guildId !== interaction.guild.id) {
    await interaction.editReply({
      content: '❌ This raid does not belong to your guild.',
    });
    return;
  }

  // Convert attendance to note entries
  const notes = raid.attendance.map((a) => ({
    username: a.username,
    playerNote: a.playerNote || undefined,
    optoutReason: a.optoutReason || undefined,
    status: a.status,
    notedAt: a.notedAt || undefined,
  }));

  // If no notes at all, let user know
  if (notes.length === 0) {
    await interaction.editReply({
      content: `ℹ️ ${trans.raidNotesNone}`,
    });
    return;
  }

  // Build embed
  const raidName = raid.description || `Raid on ${raid.raidDate.toLocaleDateString(lang)}`;
  const embed = formatRaidNotesEmbed(
    raidName,
    raid.raidDate,
    notes,
    lang,
  );

  await interaction.editReply({ embeds: [embed] });
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

  const raidId = interaction.options.get('raid_id', true).value as string;
  const dateStr = interaction.options.get('date', true).value as string;
  const timeStr = interaction.options.get('time', false)?.value as string | undefined;
  const titleOverride = interaction.options.get('title', false)?.value as string | undefined;

  // Fetch source raid with guild data
  const sourceRaid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: { guild: true },
  });

  if (!sourceRaid) {
    await interaction.editReply({
      content: '❌ ' + t('en', 'raidNotFound'),
    });
    return;
  }

  // Ensure raid belongs to this guild
  if (sourceRaid.guildId !== interaction.guild.id) {
    await interaction.editReply({
      content: '❌ This raid does not belong to this server.',
    });
    return;
  }

  const lang = sourceRaid.guild.language || 'en';
  const trans = getTranslations(lang);

  // Validate date format
  const dateError = validateDateFormat(dateStr);
  if (dateError) {
    await interaction.editReply({ content: dateError });
    return;
  }

  // Determine time: use provided time, or extract from source raid
  let effectiveTimeStr: string;
  if (timeStr) {
    const timeError = validateTimeFormat(timeStr);
    if (timeError) {
      await interaction.editReply({ content: timeError });
      return;
    }
    effectiveTimeStr = timeStr;
  } else {
    // Extract time from source raid (convert back from UTC to local)
    const timezoneOffsetHours = sourceRaid.guild.timezoneOffset || 0;
    const localDate = new Date(sourceRaid.raidDate.getTime() + (timezoneOffsetHours * 60 * 60 * 1000));
    const hours = String(localDate.getUTCHours()).padStart(2, '0');
    const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');
    effectiveTimeStr = `${hours}:${minutes}`;
  }

  // Parse and validate date/time with timezone offset
  const dateTimeStr = `${dateStr}T${effectiveTimeStr}:00`;
  const localDate = new Date(dateTimeStr);
  const timezoneOffsetHours = sourceRaid.guild.timezoneOffset || 0;
  const raidDate = new Date(localDate.getTime() - (timezoneOffsetHours * 60 * 60 * 1000));

  if (isNaN(raidDate.getTime())) {
    await interaction.editReply({
      content: trans.invalidDateTime,
    });
    return;
  }

  if (raidDate < new Date()) {
    await interaction.editReply({
      content: trans.raidMustBeFuture,
    });
    return;
  }

  // Use source raid's roles to find eligible members
  const effectiveRolesInput = sourceRaid.roles;
  if (!effectiveRolesInput || effectiveRolesInput.trim() === '') {
    await interaction.editReply({
      content: '❌ ' + trans.cloneNoRoles,
    });
    return;
  }

  const roleIds = effectiveRolesInput.split(',').map((r: string) => r.trim()).filter(Boolean);

  // Fetch guild members and find eligible ones
  let eligibleMembers = new Set<string>();
  await interaction.guild.members.fetch();

  for (const [memberId, guildMember] of interaction.guild.members.cache) {
    if (guildMember.user.bot) continue;

    const hasRaidRole = guildMember.roles.cache.some((role) =>
      roleIds.includes(role.id) || roleIds.includes(role.name)
    );

    if (hasRaidRole) {
      eligibleMembers.add(memberId);
    }
  }

  if (eligibleMembers.size === 0) {
    await interaction.editReply({
      content: trans.noEligibleMembers,
    });
    return;
  }

  // Ensure all eligible members have UserPreference records
  for (const userId of eligibleMembers) {
    const guildMember = interaction.guild.members.cache.get(userId);
    if (guildMember) {
      await prisma.userPreference.upsert({
        where: {
          userId_guildId: {
            userId,
            guildId: interaction.guild.id,
          },
        },
        update: {
          username: guildMember.displayName,
        },
        create: {
          userId,
          guildId: interaction.guild.id,
          username: guildMember.displayName,
        },
      });
    }
  }

  // Get user preferences for class/spec
  const userPrefs = await prisma.userPreference.findMany({
    where: {
      guildId: interaction.guild.id,
      userId: { in: Array.from(eligibleMembers) },
    },
  });

  const prefsMap = new Map<string, typeof userPrefs[0]>(userPrefs.map((p: typeof userPrefs[0]) => [p.userId, p]));

  // Determine the title for the new raid
  const newTitle = titleOverride || sourceRaid.description || trans.cloneDefaultTitle;

  // Create cloned raid
  const newRaid = await prisma.raid.create({
    data: {
      guildId: interaction.guild.id,
      channelId: interaction.channel.id,
      raidDate,
      description: newTitle,
      roles: sourceRaid.roles,
      createdBy: interaction.user.id,
      createdFromTemplateId: sourceRaid.id,
      clonedAt: new Date(),
    },
  });

  // Create attendance records for all eligible members with their saved class/spec
  const attendanceData = Array.from(eligibleMembers).map((userId) => {
    const guildMember = interaction.guild!.members.cache.get(userId);
    const pref = prefsMap.get(userId);
    return {
      raidId: newRaid.id,
      userId,
      guildId: interaction.guild!.id,
      username: guildMember?.displayName || 'Unknown',
      status: 'attending' as const,
      wowClass: pref?.wowClass || null,
      wowSpec: pref?.wowSpec || null,
    };
  });

  await prisma.raidAttendance.createMany({
    data: attendanceData,
  });

  // Create embed
  const embed = await createRaidEmbed(newRaid.id, lang);

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
  if (!interaction.channel || !('send' in interaction.channel)) {
    await interaction.editReply({
      content: trans.cannotSendMessage,
    });
    return;
  }

  const message = await interaction.channel.send({
    embeds: [embed],
    components: [row1, row2],
  });

  // Update raid with message ID
  await prisma.raid.update({
    where: { id: newRaid.id },
    data: { messageId: message.id },
  });

  // Format the source date for display
  const sourceLocalDate = new Date(sourceRaid.raidDate.getTime() + (timezoneOffsetHours * 60 * 60 * 1000));
  const sourceDateDisplay = sourceLocalDate.toISOString().split('T')[0];

  await interaction.editReply({
    content: t(lang, 'cloneRaidSuccess', {
      title: sourceRaid.description || 'Raid',
      date: dateStr,
      count: eligibleMembers.size,
    }),
  });
}

/**
 * Handle /raid pin command - Archive a raid to the archive channel
 */
async function handlePinCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const raidId = interaction.options.getString('raid_id', true);

  // Check permissions
  const member = interaction.member;
  if (!member || !(await canManageRaids(member as any))) {
    await interaction.editReply({
      content: '❌ You do not have permission to archive raids.',
    });
    return;
  }

  try {
    // Verify raid exists and belongs to this guild
    const raid = await prisma.raid.findUnique({
      where: { id: raidId },
    });

    if (!raid) {
      await interaction.editReply({
        content: `❌ Raid ${raidId} not found.`,
      });
      return;
    }

    if (raid.guildId !== interaction.guild.id) {
      await interaction.editReply({
        content: '❌ This raid does not belong to your guild.',
      });
      return;
    }

    if (raid.isPinned) {
      const guildData = await prisma.guild.findUnique({
        where: { id: interaction.guild.id },
      });
      const lang = guildData?.language || 'en';
      const trans = getTranslations(lang);
      
      await interaction.editReply({
        content: `❌ ${trans.raidAlreadyArchived}`,
      });
      return;
    }

    // Archive the raid
    await archiveRaid(raidId, interaction.guild.id, interaction.client);

    // Get updated raid data for notification
    const archivedRaid = await prisma.raid.findUnique({
      where: { id: raidId },
    });

    if (!archivedRaid) {
      await interaction.editReply({
        content: 'Error: Raid was archived but could not be retrieved.',
      });
      return;
    }

    // Get language for response
    const guildData = await prisma.guild.findUnique({
      where: { id: interaction.guild.id },
    });
    const lang = guildData?.language || 'en';

    // Send success response
    await interaction.editReply({
      content: `✅ Raid "${archivedRaid.description || 'Unnamed Raid'}" has been archived.`,
    });
  } catch (error) {
    console.error('Error archiving raid:', error);
    
    const guildData = await prisma.guild.findUnique({
      where: { id: interaction.guild.id },
    });
    const lang = guildData?.language || 'en';
    const trans = getTranslations(lang);
    
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await interaction.editReply({
      content: `❌ ${errorMsg}`,
    });
  }
}

/**
 * Handle /raid unpin command - Restore an archived raid
 */
async function handleUnpinCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const raidId = interaction.options.getString('raid_id', true);

  // Check permissions
  const member = interaction.member;
  if (!member || !(await canManageRaids(member as any))) {
    await interaction.editReply({
      content: '❌ You do not have permission to restore raids.',
    });
    return;
  }

  try {
    // Verify raid exists and belongs to this guild
    const raid = await prisma.raid.findUnique({
      where: { id: raidId },
    });

    if (!raid) {
      await interaction.editReply({
        content: `❌ Raid ${raidId} not found.`,
      });
      return;
    }

    if (raid.guildId !== interaction.guild.id) {
      await interaction.editReply({
        content: '❌ This raid does not belong to your guild.',
      });
      return;
    }

    if (!raid.isPinned) {
      const guildData = await prisma.guild.findUnique({
        where: { id: interaction.guild.id },
      });
      const lang = guildData?.language || 'en';
      const trans = getTranslations(lang);
      
      await interaction.editReply({
        content: `❌ ${trans.raidNotArchived}`,
      });
      return;
    }

    // Unarchive the raid
    await unarchiveRaid(raidId, interaction.guild.id, interaction.client);

    // Get updated raid data for notification
    const restoredRaid = await prisma.raid.findUnique({
      where: { id: raidId },
    });

    if (!restoredRaid) {
      await interaction.editReply({
        content: 'Error: Raid was restored but could not be retrieved.',
      });
      return;
    }

    // Send success response
    await interaction.editReply({
      content: `✅ Raid "${restoredRaid.description || 'Unnamed Raid'}" has been restored.`,
    });
  } catch (error) {
    console.error('Error restoring raid:', error);
    
    const guildData = await prisma.guild.findUnique({
      where: { id: interaction.guild.id },
    });
    const lang = guildData?.language || 'en';
    
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await interaction.editReply({
      content: `❌ ${errorMsg}`,
    });
  }
}

/**
 * Handle /raid search command - Search archived raids
 */
async function handleSearchCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const query = interaction.options.getString('query', false);
  const periodStr = interaction.options.getString('period', false);

  try {
    // Get language for response
    const guildData = await prisma.guild.findUnique({
      where: { id: interaction.guild.id },
    });
    const lang = guildData?.language || 'en';

    // Parse period into date range
    let startDate: Date | undefined;
    if (periodStr && periodStr !== 'all') {
      const days = parseInt(periodStr, 10);
      if (!isNaN(days)) {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
      }
    }

    // Search archive
    const results = await searchArchive({
      guildId: interaction.guild.id,
      query: query || undefined,
      startDate,
    });

    // Format and send results
    const embed = formatArchiveSearchEmbed(results, query, periodStr, lang);
    await interaction.editReply({
      embeds: [embed],
    });
  } catch (error) {
    console.error('Error searching archive:', error);
    
    const guildData = await prisma.guild.findUnique({
      where: { id: interaction.guild.id },
    });
    const lang = guildData?.language || 'en';
    
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await interaction.editReply({
      content: `❌ ${errorMsg}`,
    });
  }
}

async function handleBadgesCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  const playerOption = interaction.options.get('player', false);
  const targetUser = playerOption ? playerOption.user : interaction.user;
  if (!targetUser) {
    await interaction.reply({
      content: '❌ Unable to determine target user.',
      ephemeral: true,
    });
    return;
  }
  const targetUserId = targetUser.id;

  // Check if target user is in the guild
  const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
  if (!member) {
    await interaction.reply({
      content: '❌ The specified user is not in this server.',
      ephemeral: true,
    });
    return;
  }

  // Get guild language
  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });
  const language = guildData?.language || 'en';

  // Get the embed
  const embed = await formatPlayerBadgesDetailed(targetUserId, interaction.guild.id, language, member.displayName);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleAwardBadgeCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: false });

  // Check permissions
  const member = interaction.member;
  if (!member || !(await canManageRaids(member as any))) {
    await interaction.editReply({
      content: '❌ You do not have permission to award badges.',
    });
    return;
  }

  const player = interaction.options.getUser('player', true);
  const badgeType = interaction.options.getString('badge', true) as BadgeType;
  const reason = interaction.options.getString('reason');

  // Check if player is in guild
  const guildMember = interaction.guild.members.cache.get(player.id);
  if (!guildMember) {
    await interaction.editReply({
      content: '❌ Player not found in this server.',
    });
    return;
  }

  // Award badge
  const awarded = await awardManualBadge(player.id, interaction.guild.id, badgeType, interaction.user.id, reason || undefined);

  if (!awarded) {
    await interaction.editReply({
      content: '❌ Badge could not be awarded (player may already have it).',
    });
    return;
  }

  // Get guild language
  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });
  const language = guildData?.language || 'en';
  const trans = getTranslations(language);

  // Get badge name and emoji
  const badgeName = getBadgeName(badgeType, language);
  const emoji = getBadgeEmoji(badgeType);

  // Build celebration message
  let message = trans.badgeEarned
    ? trans.badgeEarned.replace('{playerName}', guildMember.displayName).replace('{badgeName}', `${emoji} ${badgeName}`)
    : `${emoji} ${guildMember.displayName} earned ${badgeName} badge!`;

  if (reason) {
    message += ` Reason: ${reason}`;
  }

  // Send celebration to channel
  if (interaction.channel && 'send' in interaction.channel) {
    await interaction.channel.send(message);
  }

  // Reply with success
  await interaction.editReply({
    content: `✅ Badge awarded successfully!`,
  });
}

async function handleFeedbackCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const raidId = interaction.options.getString('raid_id', true);

  // Validate raid exists and belongs to this guild
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

  // Analyze feedback
  const analysis = await analyzeRaidFeedback(raidId);
  const language = raid.guild.language || 'en';

  // Format embed
  const embed = await formatRaidFeedbackEmbed(raid.description || 'Raid', raid.raidDate, analysis, language);

  await interaction.editReply({ embeds: [embed] });
}

async function handleMoraleCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const period = interaction.options.getString('period') || '30';
  const days = parseInt(period, 10);

  // Get guild data
  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  if (!guildData) {
    await interaction.editReply({
      content: '❌ Guild configuration not found.',
    });
    return;
  }

  // Analyze morale
  const morale = await getGuildMorale(interaction.guild.id, days);
  const language = guildData.language || 'en';

  // Format embed
  const embed = await formatGuildMoraleEmbed(guildData.name, morale, days, language);

  await interaction.editReply({ embeds: [embed] });
}

export default command;
