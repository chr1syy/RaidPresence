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
            .setDescription('Discord roles for this raid (comma-separated role names or IDs)')
            .setRequired(false)
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
        .setName('close')
        .setDescription('Close a raid (no further changes allowed)')
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
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents) as SlashCommandBuilder,

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
    const optedOutText = optedOut.map((a: typeof raid.attendance[0]) => `${a.username}`).join('\n');
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

  const trans = getTranslations(raid.guild.language || 'en');
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

  const trans = getTranslations(raid.guild.language || 'en');
  const timestamp = Math.floor(raid.raidDate.getTime() / 1000);

  // Get channel to send reminder
  const channel = await interaction.client.channels.fetch(raid.channelId);
  if (!channel?.isTextBased() || !('send' in channel)) {
    await interaction.editReply({
      content: '❌ Could not send reminder to raid channel.',
    });
    return;
  }

  // Get list of people who haven't responded (still "attending" but no respondedAt)
  const notResponded = raid.attendance.filter(
    (a: typeof raid.attendance[0]) => a.status === 'attending' && !a.respondedAt
  );

  const reminderEmbed = new EmbedBuilder()
    .setTitle(trans.reminderTitle)
    .setColor(0xffa500)
    .setDescription(
      t(raid.guild.language || 'en', 'reminderMessage', {
        title: raid.description || trans.raidEvent,
        timestamp: timestamp.toString(),
      })
    )
    .setFooter({ text: `${trans.raidId}: ${raid.id}` })
    .setTimestamp();

  // Build role mentions from raid's configured roles
  const roleIds = raid.roles ? raid.roles.split(',').map((r: string) => r.trim()).filter(Boolean) : [];
  const roleMentions = buildRoleMentions(interaction.guild!, roleIds);

  // Send reminder mentioning the raid's roles
  await channel.send({
    content: roleMentions || '@everyone',
    embeds: [reminderEmbed],
  });

  await interaction.editReply({
    content: t(raid.guild.language || 'en', 'raidReminderSent', { title: raid.description || 'Raid' }),
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

  // Fetch all user preferences at once for new members
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

  async function handleEditRaid(interaction: ChatInputCommandInteraction) {
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
        content: '❌ You do not have permission to edit raids. Ask your server admin to configure raid leader roles.',
      });
      return;
    }
  
    const raidId = interaction.options.get('raid_id', true).value as string;
    const dateStr = interaction.options.get('date', false)?.value as string | undefined;
    const timeStr = interaction.options.get('time', false)?.value as string | undefined;
    const title = interaction.options.get('title', false)?.value as string | undefined;
  
    // Validate at least one parameter provided
    if (!dateStr && !timeStr && !title) {
      await interaction.editReply({
        content: '❌ At least one of date, time, or title must be provided.',
      });
      return;
    }

    // ============================================================
    // VALIDATION 1: Date/Time Format Validation
    // ============================================================
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
    // VALIDATION 2: Comprehensive Raid State Validation
    // ============================================================
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
  
    if (raid.status === 'closed' || raid.status === 'cancelled') {
      await interaction.editReply({
        content: `❌ Cannot edit a ${raid.status} raid. Please contact an admin if you need to modify it.`,
      });
      return;
    }

    // Check if message ID and channel ID exist
    if (!raid.messageId) {
      await interaction.editReply({
        content: '⚠️ Warning: This raid does not have a message ID. The embed may not update, but database changes will be saved.',
      });
    }

    if (!raid.channelId) {
      await interaction.editReply({
        content: '⚠️ Warning: This raid does not have a channel ID. The embed may not update, but database changes will be saved.',
      });
    }
  
    const guildData = raid.guild;
    const updateData: any = {};
    const changes: string[] = [];
    let newRaidDate: Date | null = null;
  
    // ============================================================
    // VALIDATION 3 & 4: Parse, validate date/time, check for future date
    // ============================================================
    if (dateStr || timeStr) {
      // Use existing date/time if not provided
      const existingDate = new Date(raid.raidDate);
      const finalDateStr = dateStr || existingDate.toISOString().split('T')[0];
      const finalTimeStr = timeStr || existingDate.toISOString().substring(11, 16);
  
      const dateTimeStr = `${finalDateStr}T${finalTimeStr}:00`;
      const localDate = new Date(dateTimeStr);
  
      // Apply timezone offset (user enters local time, we store UTC)
      const timezoneOffsetHours = guildData.timezoneOffset || 0;
      newRaidDate = new Date(localDate.getTime() - (timezoneOffsetHours * 60 * 60 * 1000));
  
      if (isNaN(newRaidDate.getTime())) {
        await interaction.editReply({
          content: '❌ Invalid date or time format. Use YYYY-MM-DD for date and HH:MM for time.',
        });
        return;
      }
  
      const now = new Date();
      if (newRaidDate < now) {
        await interaction.editReply({
          content: '❌ Raid date must be in the future.',
        });
        return;
      }

      // Check if date is too far in the future (2 years)
      const maxFutureDate = new Date(now.getTime() + (2 * 365.25 * 24 * 60 * 60 * 1000));
      if (newRaidDate > maxFutureDate) {
        await interaction.editReply({
          content: '❌ Raid date too far in future. Please schedule within 2 years.',
        });
        return;
      }
  
      // Check if the date/time actually changed
      if (newRaidDate.getTime() !== raid.raidDate.getTime()) {
        updateData.raidDate = newRaidDate;
        changes.push(`Date/time updated to <t:${Math.floor(newRaidDate.getTime() / 1000)}:F>`);
      }
    }
  
    // Update title if provided
    if (title && title !== raid.description) {
      updateData.description = title;
      changes.push(`Title updated to "${title}"`);
    }
  
    // ============================================================
    // VALIDATION 5: Handle edge case - No changes requested
    // ============================================================
    if (changes.length === 0) {
      await interaction.editReply({
        content: '❌ No changes requested. Please specify at least one new value that differs from current.',
      });
      return;
    }
  
    // Update raid in database
    await prisma.raid.update({
      where: { id: raidId },
      data: updateData,
    });
  
    // ============================================================
    // VALIDATION 6: Member scanning edge cases
    // ============================================================
    
    // Get members with raid roles for roster scanning
    const roleSource = raid.roles && raid.roles.trim().length > 0
      ? raid.roles
      : guildData.raidRoles;
    const roleIds = roleSource.split(',').map((r: string) => r.trim()).filter(Boolean);
  
    let currentEligibleMembers = new Set<string>();
    let rosterScanError: string | null = null;
  
    try {
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

      // Handle case where no eligible members remain after scanning
      if (currentEligibleMembers.size === 0 && roleIds.length > 0) {
        rosterScanError = `⚠️ No eligible members found with configured roles. Roster not updated.`;
      }
    } catch (error) {
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
    // VALIDATION 5: Handle missing or deleted raid embed message
    // ============================================================
    let embedUpdateStatus = '';
    if (raid.messageId && raid.channelId) {
      try {
        const channel = await interaction.client.channels.fetch(raid.channelId);
        if (channel?.isTextBased() && 'messages' in channel) {
          try {
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
            embedUpdateStatus = '✓ Embed updated';
          } catch (messageError) {
            console.error('Error fetching raid message:', messageError);
            embedUpdateStatus = '⚠️ Could not fetch/update embed message (it may have been deleted)';
          }
        } else {
          console.error('Channel is not text-based or does not support messages');
          embedUpdateStatus = '⚠️ Could not access channel to update embed';
        }
      } catch (channelError) {
        console.error('Error fetching channel:', channelError);
        embedUpdateStatus = '⚠️ Could not access channel (may have been deleted or no permissions)';
      }
    } else if (!raid.messageId) {
      embedUpdateStatus = '⚠️ Cannot update raid embed: message ID not found';
    } else if (!raid.channelId) {
      embedUpdateStatus = '⚠️ Cannot update raid embed: channel ID not found';
    }
  
    // ============================================================
    // Build detailed success/partial success message with improvements
    // ============================================================
    let finalMessage = '✅ Raid updated successfully!\n\n';

    // Show what fields were updated
    finalMessage += '**Updated Fields:**\n';
    if (changes.length > 0) {
      finalMessage += changes.map(c => `• ${c}`).join('\n');
    }

    // Show roster changes if any
    const addedCount = membersToAdd.length;
    const removedCount = membersToRemove.length;
    if (addedCount > 0 || removedCount > 0) {
      finalMessage += '\n\n**Roster Changes:**\n';
      if (addedCount > 0) finalMessage += `• Added ${addedCount} member(s)\n`;
      if (removedCount > 0) finalMessage += `• Removed ${removedCount} member(s)`;
    }

    // Show embed status
    if (embedUpdateStatus) {
      finalMessage += `\n\n**Embed Status:** ${embedUpdateStatus}`;
    }

    // Show roster scan warning if applicable
    if (rosterScanError) {
      finalMessage += `\n\n${rosterScanError}`;
    }

    // Include raid ID and new timestamp for reference
    finalMessage += `\n\n**Raid ID:** \`${raid.id}\``;
    if (newRaidDate) {
      const timestamp = Math.floor(newRaidDate.getTime() / 1000);
      finalMessage += `\n**New Timestamp:** <t:${timestamp}:F>`;
    }
  
    await interaction.editReply({
      content: finalMessage,
    });
  }
 
 export default command;
