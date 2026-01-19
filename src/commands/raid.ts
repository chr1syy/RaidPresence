import {
  SlashCommandBuilder,
  CommandInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from 'discord.js';
import prisma from '../database/client';
import { Command } from '../types';
import { getSpecRole, getSpecSymbol, RoleComposition } from '../utils/wowData';
import { canManageRaids } from '../utils/permissions';
import { t, getTranslations } from '../utils/localization';

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

  // Get guild settings first for timezone
  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  if (!guildData) {
    await interaction.editReply({
      content: '❌ Guild not found in database. Please try again.',
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
  const roleIds = guildData.raidRoles.split(',').map((r: string) => r.trim()).filter(Boolean);

  let eligibleMembers = new Set<string>();

  if (roleIds.length > 0) {
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
  } else {
    // No roles configured, include all non-bot members
    await interaction.guild.members.fetch();
    for (const [memberId, member] of interaction.guild.members.cache) {
      if (!member.user.bot) {
        eligibleMembers.add(memberId);
      }
    }
  }

  if (eligibleMembers.size === 0) {
    await interaction.editReply({
      content: '❌ No eligible members found for this raid. Check your RAID_ROLES configuration.',
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

  const message = await interaction.channel.send({
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

  // 3-column layout: Tank | Healer | DPS
  const dpsCount = composition.melee + composition.ranged;
  
  const tankText = tankList.length > 0 
    ? tankList.join('\n') 
    : '-';
  const healerText = healerList.length > 0 
    ? healerList.join('\n') 
    : '-';
  const dpsText = dpsList.length > 0 
    ? dpsList.join('\n') 
    : '-';

  baseFields.push(
    { name: `🛡️ ${trans.tank} (${composition.tanks})`, value: tankText, inline: true },
    { name: `💚 ${trans.heal} (${composition.healers})`, value: healerText, inline: true },
    { name: `⚔️ DPS (${dpsCount})`, value: dpsText, inline: true }
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

  // Send reminder mentioning everyone
  await channel.send({
    content: '@everyone',
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
  const roleIds = guildData.raidRoles.split(',').map((r: string) => r.trim()).filter(Boolean);

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

  // Add new members
  for (const userId of membersToAdd) {
    const guildMember = interaction.guild.members.cache.get(userId);
    if (guildMember) {
      // Ensure UserPreference exists
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

      // Get user preference for class/spec
      const userPref = await prisma.userPreference.findUnique({
        where: {
          userId_guildId: {
            userId,
            guildId: interaction.guild.id,
          },
        },
      });

      // Add to attendance
      await prisma.raidAttendance.create({
        data: {
          raidId: raid.id,
          userId,
          guildId: interaction.guild.id,
          username: guildMember.displayName,
          status: 'attending',
          wowClass: userPref?.wowClass,
          wowSpec: userPref?.wowSpec,
        },
      });
    }
  }

  // Remove ineligible members
  for (const attendance of membersToRemove) {
    await prisma.raidAttendance.delete({
      where: {
        id: attendance.id,
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

        // Recreate buttons
        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`raid_opt_out_${raid.id}`)
            .setLabel('Opt Out')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(raid.status !== 'open'),
          new ButtonBuilder()
            .setCustomId(`raid_opt_in_${raid.id}`)
            .setLabel('Opt In')
            .setStyle(ButtonStyle.Success)
            .setDisabled(raid.status !== 'open'),
          new ButtonBuilder()
            .setCustomId(`raid_late_${raid.id}`)
            .setLabel('Running Late')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(raid.status !== 'open'),
          new ButtonBuilder()
            .setCustomId(`raid_set_class_${raid.id}`)
            .setLabel('Set Class/Spec')
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

export default command;
