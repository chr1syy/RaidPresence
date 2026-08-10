import {
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
import { getTier, hasFeature } from '../services/entitlementService';
import { canManageRaids } from '../utils/permissions';
import { t } from '../utils/localization';
import {
  advanceSeries,
  createFollowUpRaid,
  followUpFailureMessage,
  retireNudge,
} from '../services/recurringRaidService';
import { RECURRENCE_WEEKLY } from '../utils/recurrence';

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
    case 'nudge':
      await handleNudgeClick(interaction, raidId);
      break;
    case 'series':
      await handleStartSeries(interaction, raidId);
      break;
    case 'resume':
      await handleResumeSeries(interaction, raidId);
      break;
    default:
      await interaction.reply({
        content: '❌ Unknown action',
        ephemeral: true,
      });
  }
}

async function handleOptOut(interaction: ButtonInteraction, raidId: string) {
  const guildId = interaction.guildId;
  const tier = guildId ? await getTier(guildId) : 'FREE';
  const canUseReason = hasFeature(tier, 'raid.optout_reason');

  if (canUseReason) {
    // Premium: show modal with opt-out reason field
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
  } else {
    // Free tier: direct opt-out without reason
    await handleDirectOptOut(interaction, raidId);
  }
}

async function handleDirectOptOut(interaction: ButtonInteraction, raidId: string) {
  await interaction.deferReply({ ephemeral: true });

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
    where: { raidId_userId: { raidId, userId: interaction.user.id } },
  });

  if (!attendance) {
    await interaction.editReply({ content: '❌ You are not on the attendance list for this raid.' });
    return;
  }

  if (attendance.status === 'opted_out') {
    await interaction.editReply({ content: '❌ You have already opted out of this raid.' });
    return;
  }

  await prisma.raidAttendance.update({
    where: { raidId_userId: { raidId, userId: interaction.user.id } },
    data: {
      status: 'opted_out',
      respondedAt: new Date(),
      // Engagement signal for the recurrence zombie check — see utils/recurrence.ts.
      interactedAt: new Date(),
      optoutReason: null,
      notedAt: null,
      // Keep the denormalized team in sync with the raid (RPTIER Phase 4)
      ...(raid.teamId ? { teamId: raid.teamId } : {}),
    },
  });

  await interaction.editReply({ content: trans.optoutReasonSubmitted });
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
      // Engagement signal for the recurrence zombie check — see utils/recurrence.ts.
      interactedAt: new Date(),
      // Keep the denormalized team in sync with the raid (RPTIER Phase 4)
      ...(raid.teamId ? { teamId: raid.teamId } : {}),
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
      // Engagement signal for the recurrence zombie check — see utils/recurrence.ts.
      interactedAt: new Date(),
      // Keep the denormalized team in sync with the raid (RPTIER Phase 4)
      ...(raid.teamId ? { teamId: raid.teamId } : {}),
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

/**
 * May this member act on the raid's schedule?
 *
 * The creator always may — it is their raid — and so may anyone holding a configured
 * raid-leader role, because raid leadership rotates and a series must not die with the
 * person who happened to type the command.
 */
async function canActOnRaid(interaction: ButtonInteraction, createdBy: string): Promise<boolean> {
  if (interaction.user.id === createdBy) return true;
  return !!interaction.member && (await canManageRaids(interaction.member as any));
}

/**
 * "Next week, same time?" — one click turns a finished raid into next week's raid.
 *
 * The button only exists on raids without a series, so this creates a one-off follow-up
 * and then offers to turn *that* into a series, which is the cheap bridge into the
 * recurring feature: the leader has already seen it work once.
 */
async function handleNudgeClick(interaction: ButtonInteraction, raidId: string) {
  await interaction.deferReply({ ephemeral: true });

  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: { guild: true },
  });

  if (!raid) {
    await interaction.editReply({ content: '❌ Raid not found.' });
    return;
  }

  const language = raid.guild.language || 'en';

  if (!(await canActOnRaid(interaction, raid.createdBy))) {
    await interaction.editReply({ content: t(language, 'nudgeNoPermission') });
    return;
  }

  const result = await createFollowUpRaid(interaction.client, raid, {
    mode: 'none',
    createdBy: interaction.user.id,
  });

  if (!result.ok) {
    // A duplicate means the follow-up already exists — the button is stale, so it goes.
    if (result.reason === 'duplicate') await retireNudge(interaction.client, raid);
    await interaction.editReply({ content: followUpFailureMessage(result, language) });
    return;
  }

  await retireNudge(interaction.client, raid);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`raid_series_${result.raidId}`)
      .setLabel(t(language, 'nudgeMakeSeriesButton'))
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.editReply({
    content: t(language, 'nudgeCreated', {
      unix: String(Math.floor(result.raidDate.getTime() / 1000)),
      count: String(result.memberCount),
    }),
    components: [row],
  });
}

/** Turns the raid behind the button into a weekly series (offered after a nudge click). */
async function handleStartSeries(interaction: ButtonInteraction, raidId: string) {
  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: { guild: true },
  });

  if (!raid) {
    await interaction.reply({ content: '❌ Raid not found.', ephemeral: true });
    return;
  }

  const language = raid.guild.language || 'en';

  if (!(await canActOnRaid(interaction, raid.createdBy))) {
    await interaction.reply({ content: t(language, 'recurringNoPermission'), ephemeral: true });
    return;
  }

  await prisma.raid.update({
    where: { id: raid.id },
    data: { recurrenceRule: RECURRENCE_WEEKLY, recurrenceActive: true, recurrenceSilentStreak: 0 },
  });

  // The button lives on this bot's own ephemeral reply, so it is replaced rather than
  // answered — leaving a live "start series" button on a started series invites a re-click.
  await interaction.update({
    content: t(language, 'recurringSeriesStarted', { title: raid.description || 'Raid' }),
    components: [],
  });
}

/**
 * Restarts a series that was paused (zombie streak, weekly limit, lost channel) and
 * immediately creates the raid the pause skipped.
 */
async function handleResumeSeries(interaction: ButtonInteraction, raidId: string) {
  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: { guild: true },
  });

  if (!raid) {
    await interaction.reply({ content: '❌ Raid not found.', ephemeral: true });
    return;
  }

  const language = raid.guild.language || 'en';

  if (!(await canActOnRaid(interaction, raid.createdBy))) {
    await interaction.reply({ content: t(language, 'recurringNoPermission'), ephemeral: true });
    return;
  }

  await interaction.deferUpdate();

  // Clearing the streak is the whole point of resuming: a leader pressing this button is
  // the engagement the counter was looking for.
  const reactivated = await prisma.raid.update({
    where: { id: raid.id },
    data: {
      recurrenceRule: raid.recurrenceRule || RECURRENCE_WEEKLY,
      recurrenceActive: true,
      recurrenceSilentStreak: 0,
    },
  });

  try {
    await interaction.message.edit({ components: [] });
  } catch {
    // The notice may have been deleted; resuming still worked.
  }

  const result = await advanceSeries(interaction.client, reactivated);

  await interaction.followUp({
    content: result.ok
      ? t(language, 'recurringSeriesResumed', {
          unix: String(Math.floor(result.raidDate.getTime() / 1000)),
        })
      : followUpFailureMessage(result, language),
    ephemeral: true,
  });
}

export async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  const customId = interaction.customId;

  // Handle opt-out reason modal
  if (customId.startsWith('optout_reason_')) {
    await handleOptOutReasonSubmit(interaction);
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
      // Engagement signal for the recurrence zombie check — see utils/recurrence.ts.
      interactedAt: new Date(),
      optoutReason: reason || null,
      notedAt: reason ? new Date() : null,
      // Keep the denormalized team in sync with the raid (RPTIER Phase 4)
      ...(raid.teamId ? { teamId: raid.teamId } : {}),
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
