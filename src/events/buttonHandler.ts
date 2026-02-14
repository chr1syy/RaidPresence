import {
  ButtonInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
  TextChannel,
  NewsChannel,
} from 'discord.js';
import prisma from '../database/client';
import { createRaidEmbed } from '../commands/raid';
import { getClassList } from '../utils/wowData';
import { getTranslations } from '../utils/localization';

// Map to store pending raid creation data for confirmation
export const pendingRaidCreations = new Map<string, {
  userId: string;
  guildId: string;
  raidDate: Date;
  title: string;
  roles: string;
  eligibleMembers: Set<string>;
  guildData: any;
  channel: any;
}>();

// Map to store pending bulk close operations for confirmation
export const pendingBulkCloses = new Map<string, {
  userId: string;
  guildId: string;
  beforeDate: Date;
  raidIds: string[];
}>();

export async function handleButton(interaction: ButtonInteraction) {
  const customId = interaction.customId;

  if (customId.startsWith('raid_optout_') || customId.startsWith('optout_')) {
    const raidId = parseCustomIdSuffix(customId, ['raid_optout_', 'optout_']);
    if (!raidId) return;
    await handleOptOut(interaction, raidId);
  } else if (customId.startsWith('raid_optin_') || customId.startsWith('optin_')) {
    const raidId = parseCustomIdSuffix(customId, ['raid_optin_', 'optin_']);
    if (!raidId) return;
    await handleOptIn(interaction, raidId);
  } else if (customId.startsWith('raid_late_') || customId.startsWith('late_')) {
    const raidId = parseCustomIdSuffix(customId, ['raid_late_', 'late_']);
    if (!raidId) return;
    await handleRunningLate(interaction, raidId);
  } else if (customId.startsWith('raid_class_') || customId.startsWith('class_')) {
    const raidId = parseCustomIdSuffix(customId, ['raid_class_', 'class_']);
    if (!raidId) return;
    await handleClassSelection(interaction, raidId);
  } else if (customId.startsWith('feedback_')) {
    const feedback = parseFeedbackButtonId(customId);
    if (!feedback) return;
    const { mood, raidId } = feedback;
    await handleFeedback(interaction, raidId, mood);
  } else if (customId.startsWith('create_confirm_')) {
    const confirmationId = customId.substring('create_confirm_'.length);
    if (!confirmationId) return;
    await handleCreateConfirm(interaction, confirmationId);
  } else if (customId.startsWith('create_cancel_')) {
    const confirmationId = customId.substring('create_cancel_'.length);
    if (!confirmationId) return;
    await handleCreateCancel(interaction, confirmationId);
  } else if (customId.startsWith('close_all_confirm_')) {
    const confirmationId = customId.substring('close_all_confirm_'.length);
    if (!confirmationId) return;
    await handleCloseAllConfirm(interaction, confirmationId);
  } else if (customId === 'close_all_cancel') {
    await handleCloseAllCancel(interaction);
  }
}

function parseCustomIdSuffix(customId: string, prefixes: string[]): string | null {
  for (const prefix of prefixes) {
    if (customId.startsWith(prefix)) {
      const suffix = customId.substring(prefix.length);
      return suffix.length > 0 ? suffix : null;
    }
  }

  return null;
}

function parseFeedbackButtonId(customId: string): { mood: string; raidId: string } | null {
  const prefix = 'feedback_';
  if (!customId.startsWith(prefix)) {
    return null;
  }

  const payload = customId.substring(prefix.length);
  const separatorIndex = payload.indexOf('_');
  if (separatorIndex === -1) {
    return null;
  }

  const mood = payload.substring(0, separatorIndex);
  const raidId = payload.substring(separatorIndex + 1);

  if (!mood || !raidId) {
    return null;
  }

  return { mood, raidId };
}

async function handleOptOut(interaction: ButtonInteraction, raidId: string) {
  // Show modal immediately for opt-out reason (<100ms response)
  // All validations will be done in the modal submit handler
  const modal = new ModalBuilder()
    .setCustomId(`optout_reason_${raidId}_${interaction.user.id}`)
    .setTitle('Opt-Out Reason')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Why are you opting out? (optional)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(false)
      )
    );

  await interaction.showModal(modal);
}

async function handleOptIn(interaction: ButtonInteraction, raidId: string) {
  await interaction.deferReply({ ephemeral: true });

  // Check raid status
  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: { guild: true },
  });

  if (!raid) {
    await interaction.editReply({ content: '❌ Raid not found.' });
    return;
  }

  const trans = getTranslations(raid.guild.language || 'en');

  if (raid.status === 'closed') {
    await interaction.editReply({ content: trans.raidIsClosed });
    return;
  }

  if (raid.status === 'cancelled') {
    await interaction.editReply({ content: trans.raidIsCancelled });
    return;
  }

  const attendance = await prisma.raidAttendance.findUnique({
    where: {
      raidId_userId: {
        raidId,
        userId: interaction.user.id,
      },
    },
  });

  if (!attendance) {
    await interaction.editReply({
      content: '❌ You are not on the attendance list for this raid.',
    });
    return;
  }

  if (attendance.status === 'attending') {
    await interaction.editReply({
      content: '✅ You are already attending this raid.',
    });
    return;
  }

  await prisma.raidAttendance.update({
    where: {
      raidId_userId: {
        raidId,
        userId: interaction.user.id,
      },
    },
    data: {
      status: 'attending',
      respondedAt: new Date(),
    },
  });

  await interaction.editReply({
    content: '✅ You are now attending this raid!',
  });

  // Update the raid message
  await updateRaidMessage(interaction, raidId);
}

async function handleRunningLate(interaction: ButtonInteraction, raidId: string) {
  await interaction.deferReply({ ephemeral: true });

  // Check raid status
  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: { guild: true },
  });

  if (!raid) {
    await interaction.editReply({ content: '❌ Raid not found.' });
    return;
  }

  const trans = getTranslations(raid.guild.language || 'en');

  if (raid.status === 'closed') {
    await interaction.editReply({ content: trans.raidIsClosed });
    return;
  }

  if (raid.status === 'cancelled') {
    await interaction.editReply({ content: trans.raidIsCancelled });
    return;
  }

  const attendance = await prisma.raidAttendance.findUnique({
    where: {
      raidId_userId: {
        raidId,
        userId: interaction.user.id,
      },
    },
  });

  if (!attendance) {
    await interaction.editReply({
      content: '❌ You are not on the attendance list for this raid.',
    });
    return;
  }

  if (attendance.status === 'late') {
    await interaction.editReply({
      content: trans.alreadyMarkedAsLate,
    });
    return;
  }

  await prisma.raidAttendance.update({
    where: {
      raidId_userId: {
        raidId,
        userId: interaction.user.id,
      },
    },
    data: {
      status: 'late',
      respondedAt: new Date(),
    },
  });

  await interaction.editReply({
    content: trans.markedAsLate,
  });

  // Update the raid message
  await updateRaidMessage(interaction, raidId);
}

async function handleClassSelection(interaction: ButtonInteraction, raidId: string) {
  const attendance = await prisma.raidAttendance.findUnique({
    where: {
      raidId_userId: {
        raidId,
        userId: interaction.user.id,
      },
    },
  });

  if (!attendance) {
    await interaction.reply({
      content: '❌ You are not on the attendance list for this raid.',
      ephemeral: true,
    });
    return;
  }

  // Create class selection menu
  const classList = getClassList();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`class_select_${raidId}`)
    .setPlaceholder('Select your class')
    .addOptions(
      classList.map((className) => ({
        label: className,
        value: className,
      }))
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.reply({
    content: '⚔️ Select your WoW class:',
    components: [row],
    ephemeral: true,
  });
}

async function handleFeedback(interaction: ButtonInteraction, raidId: string, mood: string) {
  // Map button to enum
  let moodEnum: 'GREAT' | 'OKAY' | 'FRUSTRATING';
  if (mood === 'great') moodEnum = 'GREAT';
  else if (mood === 'okay') moodEnum = 'OKAY';
  else if (mood === 'bad') moodEnum = 'FRUSTRATING';
  else return; // Invalid

  // Show modal for optional comment
  const modal = new ModalBuilder()
    .setCustomId(`feedback_comment_${raidId}_${interaction.user.id}_${mood}`)
    .setTitle('Raid Feedback')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('comment')
          .setLabel('Any additional comments? (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setRequired(false)
        )
      );

  await interaction.showModal(modal);
}

export async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  const customId = interaction.customId;

  // Handle opt-out reason modal
  if (customId.startsWith('optout_reason_')) {
    await handleOptOutReasonSubmit(interaction);
  }

  // Handle feedback comment modal
  if (customId.startsWith('feedback_comment_')) {
    await handleFeedbackCommentSubmit(interaction);
  }
}

async function handleOptOutReasonSubmit(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const optoutPrefix = 'optout_reason_';
  const modalPayload = interaction.customId.substring(optoutPrefix.length);
  const separatorIndex = modalPayload.lastIndexOf('_');

  if (!modalPayload || separatorIndex === -1) {
    await interaction.editReply({
      content: '❌ Invalid modal data.',
    });
    return;
  }

  const raidId = modalPayload.substring(0, separatorIndex);
  const userId = modalPayload.substring(separatorIndex + 1);

  // Verify the user submitting is the one who started the modal
  if (interaction.user.id !== userId) {
    await interaction.editReply({
      content: '❌ This modal response is not for you.',
    });
    return;
  }

  // Get the reason input
  const reason = interaction.fields.getTextInputValue('reason').trim();

  // Check raid status
  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: { guild: true },
  });

  if (!raid) {
    await interaction.editReply({ content: '❌ Raid not found.' });
    return;
  }

  const trans = getTranslations(raid.guild.language || 'en');

  if (raid.status === 'closed') {
    await interaction.editReply({ content: trans.raidIsClosed });
    return;
  }

  if (raid.status === 'cancelled') {
    await interaction.editReply({ content: trans.raidIsCancelled });
    return;
  }

  // Get the attendance record
  const attendance = await prisma.raidAttendance.findUnique({
    where: {
      raidId_userId: {
        raidId,
        userId: interaction.user.id,
      },
    },
  });

  if (!attendance) {
    await interaction.editReply({
      content: '❌ You are not on the attendance list for this raid.',
    });
    return;
  }

  if (attendance.status === 'opted_out') {
    await interaction.editReply({
      content: '❌ You have already opted out of this raid.',
    });
    return;
  }

  // Update the attendance with opted_out status and reason
  await prisma.raidAttendance.update({
    where: {
      raidId_userId: {
        raidId,
        userId: interaction.user.id,
      },
    },
    data: {
      status: 'opted_out',
      respondedAt: new Date(),
      optoutReason: reason || null,
      notedAt: reason ? new Date() : null,
    },
  });

  await interaction.editReply({
    content: trans.optoutReasonSubmitted,
  });

   // Update the raid message
   try {
     if (!raid.messageId || !raid.channelId) return;
     
     const channel = await interaction.client.channels.fetch(raid.channelId);
     if (!channel || !(channel instanceof TextChannel || channel instanceof NewsChannel)) {
       return;
     }
     
     const message = await channel.messages.fetch(raid.messageId);
     if (message) {
       const embed = await createRaidEmbed(raidId, raid.guild.language);
       await message.edit({
         embeds: [embed],
       });
     }
   } catch (error) {
     console.error('Error updating raid message:', error);
  }
}

async function handleFeedbackCommentSubmit(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const feedbackPrefix = 'feedback_comment_';
  const modalPayload = interaction.customId.substring(feedbackPrefix.length);
  const lastSeparatorIndex = modalPayload.lastIndexOf('_');
  const secondLastSeparatorIndex = modalPayload.lastIndexOf('_', lastSeparatorIndex - 1);

  if (!modalPayload || lastSeparatorIndex === -1 || secondLastSeparatorIndex === -1) {
    await interaction.editReply({
      content: '❌ Invalid modal data.',
    });
    return;
  }

  const raidId = modalPayload.substring(0, secondLastSeparatorIndex);
  const userId = modalPayload.substring(secondLastSeparatorIndex + 1, lastSeparatorIndex);
  const mood = modalPayload.substring(lastSeparatorIndex + 1);

  // Verify the user submitting is the one who started the modal
  if (interaction.user.id !== userId) {
    await interaction.editReply({
      content: '❌ This modal response is not for you.',
    });
    return;
  }

  // Map mood string to enum
  let moodEnum: 'GREAT' | 'OKAY' | 'FRUSTRATING';
  if (mood === 'great') moodEnum = 'GREAT';
  else if (mood === 'okay') moodEnum = 'OKAY';
  else if (mood === 'bad') moodEnum = 'FRUSTRATING';
  else {
    await interaction.editReply({ content: '❌ Invalid feedback mood.' });
    return;
  }

  // Get the comment input
  const comment = interaction.fields.getTextInputValue('comment').trim();

  // Store feedback in database
  try {
    await prisma.raidFeedback.create({
      data: {
        raidId,
        userId: interaction.user.id,
        mood: moodEnum,
        comment: comment || null,
      },
    });
  } catch (error: any) {
    // Handle duplicate feedback (unique constraint)
    if (error.code === 'P2002') {
      await interaction.editReply({
        content: '❌ You have already submitted feedback for this raid.',
      });
      return;
    }
    throw error;
  }

  // Visual confirmation with emoji
  const emoji = mood === 'great' ? '😊' : mood === 'okay' ? '😐' : '😞';
  await interaction.editReply({
    content: `${emoji} Thank you for your feedback!`,
  });
}

async function updateRaidMessage(interaction: ButtonInteraction, raidId: string) {
  try {
    const raid = await prisma.raid.findUnique({
      where: { id: raidId },
      include: { guild: true },
    });

    if (!raid || !raid.messageId) return;

    const embed = await createRaidEmbed(raidId, raid.guild.language);

    await interaction.message.edit({
      embeds: [embed],
    });
  } catch (error) {
    console.error('Error updating raid message:', error);
  }
}

async function handleCreateConfirm(interaction: ButtonInteraction, confirmationId: string) {
  await interaction.deferReply({ ephemeral: true });

  const data = pendingRaidCreations.get(confirmationId);
  if (!data) {
    await interaction.editReply({ content: '❌ Confirmation expired or invalid.' });
    return;
  }

  if (data.userId !== interaction.user.id) {
    await interaction.editReply({ content: '❌ This confirmation is not for you.' });
    return;
  }

  // Recreate the raid creation logic
  const { guildId, raidDate, title, roles, eligibleMembers, guildData, channel } = data;

  // Ensure all eligible members have UserPreference records
  for (const userId of eligibleMembers) {
    const member = interaction.guild?.members.cache.get(userId);
    if (member) {
      await prisma.userPreference.upsert({
        where: {
          userId_guildId: {
            userId,
            guildId,
          },
        },
        update: {
          username: member.displayName,
        },
        create: {
          userId,
          guildId,
          username: member.displayName,
        },
      });
    }
  }

  // Get user preferences for class/spec
  const userPrefs = await prisma.userPreference.findMany({
    where: {
      guildId,
      userId: { in: Array.from(eligibleMembers) },
    },
  });

  const prefsMap = new Map(userPrefs.map(p => [p.userId, p]));

  // Create raid in database
  const raid = await prisma.raid.create({
    data: {
      guildId,
      channelId: channel.id,
      raidDate,
      description: title,
      roles,
      createdBy: data.userId,
    },
  });

  // Create attendance records
  const attendanceData = Array.from(eligibleMembers).map(userId => {
    const member = interaction.guild!.members.cache.get(userId);
    const pref = prefsMap.get(userId);
    return {
      raidId: raid.id,
      userId,
      guildId,
      username: member?.displayName || 'Unknown',
      status: 'attending' as const,
      wowClass: pref?.wowClass || null,
      wowSpec: pref?.wowSpec || null,
    };
  });

  await prisma.raidAttendance.createMany({
    data: attendanceData,
  });

  // Create embed
  const embed = await createRaidEmbed(raid.id, guildData.language);

  // Get translations
  const { getTranslations } = await import('../utils/localization');
  const trans = getTranslations(guildData.language || 'en');

  // Create buttons
  const row1 = new ActionRowBuilder().addComponents(
    new (await import('discord.js')).ButtonBuilder()
      .setCustomId(`raid_optin_${raid.id}`)
      .setLabel(trans.optIn)
      .setStyle((await import('discord.js')).ButtonStyle.Success),
    new (await import('discord.js')).ButtonBuilder()
      .setCustomId(`raid_late_${raid.id}`)
      .setLabel(trans.runningLateButton)
      .setStyle((await import('discord.js')).ButtonStyle.Secondary),
    new (await import('discord.js')).ButtonBuilder()
      .setCustomId(`raid_optout_${raid.id}`)
      .setLabel(trans.optOut)
      .setStyle((await import('discord.js')).ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new (await import('discord.js')).ButtonBuilder()
      .setCustomId(`raid_class_${raid.id}`)
      .setLabel(trans.setClassSpec)
      .setStyle((await import('discord.js')).ButtonStyle.Primary)
  );

  // Send message
  const message = await channel.send({
    content: undefined,
    embeds: [embed],
    components: [row1, row2],
  });

  // Update raid with message ID
  await prisma.raid.update({
    where: { id: raid.id },
    data: { messageId: message.id },
  });

  // Clean up
  pendingRaidCreations.delete(confirmationId);

  await interaction.editReply({
    content: `✅ Raid "${title}" created successfully with ${eligibleMembers.size} members!`,
  });
}

async function handleCreateCancel(interaction: ButtonInteraction, confirmationId: string) {
  await interaction.deferReply({ ephemeral: true });

  const data = pendingRaidCreations.get(confirmationId);
  if (!data || data.userId !== interaction.user.id) {
    await interaction.editReply({ content: '❌ Invalid confirmation.' });
    return;
  }

  pendingRaidCreations.delete(confirmationId);

  await interaction.editReply({ content: '❌ Raid creation cancelled.' });
}

async function handleCloseAllConfirm(interaction: ButtonInteraction, confirmationId: string) {
  await interaction.deferReply({ ephemeral: true });

  const data = pendingBulkCloses.get(confirmationId);
  if (!data) {
    await interaction.editReply({ content: '❌ Confirmation expired or invalid.' });
    return;
  }

  if (data.userId !== interaction.user.id) {
    await interaction.editReply({ content: '❌ This confirmation is not for you.' });
    return;
  }

  const { guildId, raidIds } = data;

  // Process each raid
  let closedCount = 0;
  let failedCount = 0;
  const results: string[] = [];

  for (const raidId of raidIds) {
    try {
      const raid = await prisma.raid.findUnique({
        where: { id: raidId },
        include: { guild: true },
      });

      if (!raid || raid.guildId !== guildId || raid.status !== 'open') {
        failedCount++;
        results.push(`❌ Failed to close raid "${raid?.description || raidId}"`);
        continue;
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

      closedCount++;
      results.push(`✅ Closed "${raid.description || 'Unnamed Raid'}"`);
    } catch (error) {
      console.error(`Error closing raid ${raidId}:`, error);
      failedCount++;
      results.push(`❌ Failed to close raid ${raidId}`);
    }
  }

  // Clean up
  pendingBulkCloses.delete(confirmationId);

  const summary = `Bulk close completed:\n- Successfully closed: ${closedCount}\n- Failed: ${failedCount}`;
  const detailedResults = results.length > 10 ? results.slice(0, 10).join('\n') + '\n...' : results.join('\n');

  await interaction.editReply({
    content: `${summary}\n\n${detailedResults}`,
  });
}

async function handleCloseAllCancel(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  // No need to check user since anyone can cancel (no sensitive data)
  await interaction.editReply({ content: '❌ Bulk close operation cancelled.' });
}
