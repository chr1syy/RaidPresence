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

export async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  const customId = interaction.customId;

  // Handle opt-out reason modal
  if (customId.startsWith('optout_reason_')) {
    await handleOptOutReasonSubmit(interaction);
  } else if (customId.startsWith('feedback_comment_')) {
    await handleFeedbackCommentSubmit(interaction);
  }
}

async function handleOptOutReasonSubmit(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const customIdParts = interaction.customId.split('_');
  const raidId = customIdParts[2];
  const userId = customIdParts[3];

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
          .setLabel('Additional comments (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setRequired(false)
      )
    );

  await interaction.showModal(modal);
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
  const moodStr = modalPayload.substring(lastSeparatorIndex + 1);

  // Verify the user submitting is the one who started the modal
  if (interaction.user.id !== userId) {
    await interaction.editReply({
      content: '❌ This modal response is not for you.',
    });
    return;
  }

  // Map mood string to enum
  let mood: 'GREAT' | 'OKAY' | 'FRUSTRATING';
  if (moodStr === 'great') mood = 'GREAT';
  else if (moodStr === 'okay') mood = 'OKAY';
  else if (moodStr === 'bad') mood = 'FRUSTRATING';
  else {
    await interaction.editReply({
      content: '❌ Invalid mood data.',
    });
    return;
  }

  // Get the comment input
  const comment = interaction.fields.getTextInputValue('comment').trim();

  // Check if raid exists
  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: { guild: true },
  });

  if (!raid) {
    await interaction.editReply({ content: '❌ Raid not found.' });
    return;
  }

  // Check if user was in the raid
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
      content: '❌ You were not in this raid.',
    });
    return;
  }

  // Check if feedback already exists
  const existingFeedback = await prisma.raidFeedback.findUnique({
    where: {
      raidId_userId: {
        raidId,
        userId: interaction.user.id,
      },
    },
  });

  if (existingFeedback) {
    await interaction.editReply({
      content: '❌ You have already submitted feedback for this raid.',
    });
    return;
  }

  // Save feedback
  await prisma.raidFeedback.create({
    data: {
      raidId,
      userId: interaction.user.id,
      mood,
      comment: comment || null,
    },
  });

  const trans = getTranslations(raid.guild.language || 'en');
  await interaction.editReply({
    content: trans.feedbackSubmitted,
  });
}
