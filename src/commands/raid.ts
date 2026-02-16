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
import { VERSION } from '../utils/version';
import { calculatePlayerStats, getPlayerRoleDistribution, getPlayerAttendanceHistory } from '../utils/attendanceAnalytics';
import { formatAttendanceEmbed } from '../utils/attendanceFormatter';
import { analyzeRaidComposition, findCompositionGaps, suggestPlayerSwaps, calculateSuccessLikelihood, CompositionAttendee } from '../utils/compositionAnalyzer';
import { formatCompositionEmbed } from '../utils/compositionFormatter';
import { archiveRaid, unarchiveRaid } from '../utils/archiveManager';
import { formatArchiveSearchEmbed } from '../utils/archiveFormatter';

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
 * @returns Array of unique role IDs
 */
function parseRoleInput(input: string, guild: Guild): string[] {
  const roleIds: string[] = [];

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
      if (role) roleIds.push(role.id);
    }
  }

  return [...new Set(roleIds)];
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
  data: new SlashCommandBuilder()
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
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('List all upcoming raids')
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
        .setName('reopen')
        .setDescription('Reopen a closed raid to allow changes again')
        .addStringOption((option) =>
          option
            .setName('raid_id')
            .setDescription('The ID of the raid to reopen')
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
     )
     .addSubcommand((subcommand) =>
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
       .addSubcommand((subcommand) =>
         subcommand
           .setName('open')
           .setDescription('Reopen a closed raid to allow changes again')
           .addStringOption((option) =>
             option
               .setName('raid_id')
               .setDescription('The ID of the raid to open')
               .setRequired(true)
           )
       )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('unpin')
          .setDescription('Restore archived raid')
          .addStringOption((option) =>
            option
              .setName('raid_id')
              .setDescription('The ID of the raid to restore')
              .setRequired(true)
          )
      )

  ,

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
    } else if (subcommand === 'open') {
      await handleOpenRaid(interaction);
    } else if (subcommand === 'reopen') {
      await handleReopenRaid(interaction);
    } else if (subcommand === 'pin') {
      await handlePinRaid(interaction);
    } else if (subcommand === 'unpin') {
      await handleUnpinRaid(interaction);
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
  const roleIds = parseRoleInput(effectiveRolesInput, interaction.guild);

  if (roleIds.length === 0) {
    await interaction.editReply({
      content: '❌ No valid roles provided. Please specify at least one valid role in the command.',
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

  // Create raid in database
  const raid = await prisma.raid.create({
    data: {
      guildId: interaction.guild.id,
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

   const participantsLabel = lang === 'de' ? 'Teilnehmer' : 'Participants';
   const metaValue = `${raidStatusText}\n📅 **<t:${timestamp}:F>** (**<t:${timestamp}:R>**)\n👥 **${totalParticipants} ${participantsLabel}**`;

   const baseFields: { name: string; value: string; inline: boolean }[] = [
     { name: trans.raidStatus, value: metaValue, inline: false },
   ];

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
    .addFields({ name: 'Links', value: '[Web](https://raidpresence.dev)', inline: true })
    .setFooter({ text: `${trans.raidId}: ${raid.id} | v${VERSION}` })
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
    .addFields({ name: 'Links', value: '[Web](https://raidpresence.dev)', inline: true })
    .setFooter({ text: `v${VERSION}` })
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

  if (!raid.isPinned) {
    await interaction.editReply({
      content: '❌ This raid is not archived.',
    });
    return;
  }

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
    .addFields({ name: 'Links', value: '[Web](https://raidpresence.dev)', inline: true })
    .setFooter({ text: `${trans.raidId}: ${raid.id} | v${VERSION}` })
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
    : guildData.raidRoles || '';
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

  // Get current attendance user IDs
  const currentAttendanceUserIds = new Set(raid.attendance.map(a => a.userId));

  // Calculate new members to add
  const newMembers = Array.from(currentEligibleMembers).filter(id => !currentAttendanceUserIds.has(id));

  // Calculate members to remove
  const membersToRemove = Array.from(currentAttendanceUserIds).filter(id => !currentEligibleMembers.has(id));

  // Add new members
  if (newMembers.length > 0) {
    // Ensure UserPreference records
    for (const userId of newMembers) {
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

    // Get prefs
    const userPrefs = await prisma.userPreference.findMany({
      where: {
        guildId: interaction.guild.id,
        userId: { in: newMembers },
      },
    });

    const prefsMap = new Map(userPrefs.map(p => [p.userId, p]));

    // Create attendance
    const attendanceData = newMembers.map(userId => {
      const member = interaction.guild.members.cache.get(userId);
      const pref = prefsMap.get(userId);
      return {
        raidId: raid.id,
        userId,
        guildId: interaction.guild.id,
        username: member?.displayName || 'Unknown',
        status: 'attending' as const,
        wowClass: pref?.wowClass || null,
        wowSpec: pref?.wowSpec || null,
      };
    });

    await prisma.raidAttendance.createMany({
      data: attendanceData,
    });
  }

  // Remove ineligible members
  if (membersToRemove.length > 0) {
    await prisma.raidAttendance.deleteMany({
      where: {
        raidId: raid.id,
        userId: { in: membersToRemove },
      },
    });
  }

  // Update the embed
  if (raid.messageId && raid.channelId) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channelId);
      if (channel?.isTextBased() && 'messages' in channel) {
        const message = await channel.messages.fetch(raid.messageId);
        const embed = await createRaidEmbed(raid.id, raid.guild.language);

        await message.edit({
          embeds: [embed],
          components: raid.status === 'closed' ? [] : message.components, // keep components if not closed
        });
      }
    } catch (error) {
      console.error('Error updating raid message:', error);
    }
  }

  await interaction.editReply({
    content: `✅ Raid "${raid.description}" refreshed. Added ${newMembers.length} members, removed ${membersToRemove.length} members.`,
  });
}

async function handleEditRaid(interaction: ChatInputCommandInteraction) {
  // TODO: Implement edit raid functionality
  await interaction.reply({ content: 'Edit raid not yet implemented', ephemeral: true });
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
    const roleIds = parseRoleInput(sourceRaid.roles, interaction.guild!);

    let eligibleMembers = new Set<string>();

    // Fetch all members if not cached
    await interaction.guild!.members.fetch();

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

    // Get user preferences for class/spec
    const userPrefs = await prisma.userPreference.findMany({
      where: {
        guildId: interaction.guild!.id,
        userId: { in: Array.from(eligibleMembers) },
      },
    });

    const prefsMap = new Map(userPrefs.map((p) => [p.userId, p]));

    // Determine description
    const description = customTitle || sourceRaid.description || 'Cloned Raid';

    // Create cloned raid
    const newRaid = await prisma.raid.create({
      data: {
        guildId: interaction.guild!.id,
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
  return;
}

async function handleReopenRaid(interaction: ChatInputCommandInteraction) {
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
      content: '❌ You do not have permission to reopen raids. Ask your server admin to configure raid leader roles.',
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

  if (raid.status === 'open') {
    await interaction.editReply({
      content: '❌ This raid is already open.',
    });
    return;
  }

  // Update raid status to open
  await prisma.raid.update({
    where: { id: raidId },
    data: { status: 'open' },
  });

  // Update the raid message
  if (raid.messageId && raid.channelId) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channelId);
      if (channel?.isTextBased() && 'messages' in channel) {
        const message = await channel.messages.fetch(raid.messageId);
        const embed = await createRaidEmbed(raidId, raid.guild.language);

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

        // Restore buttons when reopened
        await message.edit({
          embeds: [embed],
          components: [row1, row2],
        });
      }
    } catch (error) {
      console.error('Error updating raid message:', error);
    }
  }

  await interaction.editReply({
    content: `✅ Raid "${raid.description || 'Raid'}" has been reopened.`,
  });
}

async function handlePinRaid(interaction: ChatInputCommandInteraction) {
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

  try {
    await archiveRaid(raidId, interaction.guild.id, interaction.client);
    await interaction.editReply({
      content: `✅ Raid "${raid.description || 'Raid'}" has been archived.`,
    });
  } catch (error) {
    console.error('Error archiving raid:', error);
    await interaction.editReply({
      content: `❌ Failed to archive raid: ${error.message}`,
    });
  }
}

async function handleUnpinRaid(interaction: ChatInputCommandInteraction) {
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

  try {
    await unarchiveRaid(raidId, interaction.guild.id, interaction.client);
    await interaction.editReply({
      content: `✅ Raid "${raid.description || 'Raid'}" has been restored.`,
    });
  } catch (error) {
    console.error('Error restoring raid:', error);
    await interaction.editReply({
      content: `❌ Failed to restore raid: ${error.message}`,
    });
  }
}

async function handleOpenRaid(interaction: ChatInputCommandInteraction) {
  await interaction.reply({ content: 'Open raid not yet implemented', ephemeral: true });
}

export default command;
