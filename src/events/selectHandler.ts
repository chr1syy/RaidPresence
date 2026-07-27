import {
  StringSelectMenuInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import prisma from '../database/client';
import { getSpecsForClass } from '../utils/wowData';
import { createRaidEmbed } from '../commands/raid';
import { resolveUserRoleId, normalizeRoleIds } from '../utils/rolePreference';

export async function handleSelectMenu(interaction: StringSelectMenuInteraction) {
  const [action, subAction, raidId] = interaction.customId.split('_');

  if (action === 'class' && subAction === 'select') {
    await handleClassSelect(interaction, raidId);
  } else if (action === 'spec' && subAction === 'select') {
    await handleSpecSelect(interaction, raidId);
  }
}

async function handleClassSelect(interaction: StringSelectMenuInteraction, raidId: string) {
  const selectedClass = interaction.values[0];

  // Get specs for the selected class
  const specs = getSpecsForClass(selectedClass);

  if (specs.length === 0) {
    await interaction.update({
      content: '❌ No specs found for this class.',
      components: [],
    });
    return;
  }

  // Create spec selection menu
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`spec_select_${raidId}_${selectedClass}`)
    .setPlaceholder('Select your specialization')
    .addOptions(
      specs.map((spec) => ({
        label: spec,
        value: spec,
      }))
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.update({
    content: `⚔️ You selected **${selectedClass}**. Now select your spec:`,
    components: [row],
  });
}

async function handleSpecSelect(interaction: StringSelectMenuInteraction, raidId: string) {
  await interaction.deferUpdate();

  const [, , , selectedClass] = interaction.customId.split('_');
  const selectedSpec = interaction.values[0];

  if (!interaction.guild) return;

  // Get member to access displayName
  const member = await interaction.guild.members.fetch(interaction.user.id);

  const userId = interaction.user.id;
  const guildId = interaction.guild.id;

  // Fetch raid early so we can use it for role-specific preference and embed update
  const raid = await prisma.raid.findUnique({
    where: { id: raidId },
    include: { guild: true },
  });

  // Update global user preference
  await prisma.userPreference.upsert({
    where: {
      userId_guildId: { userId, guildId },
    },
    update: {
      wowClass: selectedClass,
      wowSpec: selectedSpec,
      username: member.displayName,
    },
    create: {
      userId,
      guildId,
      username: member.displayName,
      wowClass: selectedClass,
      wowSpec: selectedSpec,
    },
  });

  // Save role-specific preference if the user matches a raid role
  if (raid?.roles && interaction.guild) {
    const rawRoles = raid.roles
      .split(',')
      .map((r: string) => r.trim())
      .filter(Boolean);
    const raidRoleIds = normalizeRoleIds(rawRoles, interaction.guild);
    const userRoleIds = member.roles.cache.map((r: { id: string }) => r.id);
    const matchedRoleId = resolveUserRoleId(userRoleIds, raidRoleIds);

    if (matchedRoleId) {
      await prisma.userRolePreference.upsert({
        where: {
          userId_guildId_roleId: { userId, guildId, roleId: matchedRoleId },
        },
        update: {
          wowClass: selectedClass,
          wowSpec: selectedSpec,
        },
        create: {
          userId,
          guildId,
          roleId: matchedRoleId,
          wowClass: selectedClass,
          wowSpec: selectedSpec,
        },
      });
    }
  }

  // Update raid attendance
  await prisma.raidAttendance.update({
    where: {
      raidId_userId: { raidId, userId },
    },
    data: {
      wowClass: selectedClass,
      wowSpec: selectedSpec,
      // Keep the denormalized team in sync with the raid (RPTIER Phase 4)
      ...(raid?.teamId ? { teamId: raid.teamId } : {}),
    },
  });

  await interaction.editReply({
    content: `✅ Your class has been set to **${selectedClass} (${selectedSpec})**!\nThis will be remembered for future raids.`,
    components: [],
  });

  // Update the raid message
  try {
    if (raid && raid.messageId) {
      const channel = await interaction.client.channels.fetch(raid.channelId);

      if (channel?.isTextBased()) {
        const message = await channel.messages.fetch(raid.messageId);
        const embed = await createRaidEmbed(raidId, raid.guild.language);

        await message.edit({
          embeds: [embed],
        });
      }
    }
  } catch (error) {
    console.error('Error updating raid message:', error);
  }
}
