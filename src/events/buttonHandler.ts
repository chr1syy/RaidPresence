import {
  ButtonInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import prisma from '../database/client';
import { createRaidEmbed } from '../commands/raid';
import { getClassList } from '../utils/wowData';
import { getTranslations } from '../utils/localization';

export async function handleButton(interaction: ButtonInteraction) {
  const [action, subAction, raidId] = interaction.customId.split('_');

  if (action !== 'raid') return;

  switch (subAction) {
    case 'optout':
      await handleOptOut(interaction, raidId);
      break;
    case 'optin':
      await handleOptIn(interaction, raidId);
      break;
    case 'late':
      await handleRunningLate(interaction, raidId);
      break;
    case 'class':
      await handleClassSelection(interaction, raidId);
      break;
    default:
      await interaction.reply({
        content: '❌ Unknown action',
        ephemeral: true,
      });
  }
}

async function handleOptOut(interaction: ButtonInteraction, raidId: string) {
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

  if (attendance.status === 'opted_out') {
    await interaction.editReply({
      content: '❌ You have already opted out of this raid.',
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
      status: 'opted_out',
      respondedAt: new Date(),
    },
  });

  await interaction.editReply({
    content: '✅ You have opted out of this raid.',
  });

  // Update the raid message
  await updateRaidMessage(interaction, raidId);
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
