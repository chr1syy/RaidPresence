/**
 * Handlers for the two welcome-message buttons (issue #39).
 *
 * The hard constraint here is delivery: the welcome message is sent by DM to
 * whoever installed the bot, and only falls back to the guild's system channel. In
 * a DM the interaction has **no guild context** — `interaction.guild` is null and
 * the member (and therefore their roles) is unavailable. Both buttons must
 * therefore either work without a guild, or lead the user cleanly back into the
 * server. The guild id rides along in the custom ID so we always know which server
 * "back" means.
 */

import {
  ActionRowBuilder,
  ButtonInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import prisma from '../database/client';
import { canManageRaids } from '../utils/permissions';
import { t } from '../utils/localization';
import {
  COMMON_TIMEZONES,
  formatTimezoneLabel,
  guildTimezoneUpdate,
  normalizeTimezone,
} from '../utils/timezoneHelper';
import { WELCOME_BUTTON_FIRST_RAID, WELCOME_BUTTON_SETUP } from '../utils/welcomeEmbed';

export const WELCOME_SELECT_TIMEZONE = 'welcome-tz';

/** Discord allows at most 25 options in a select menu. */
const TIMEZONE_CHOICE_LIMIT = 25;

export function isWelcomeButton(customId: string): boolean {
  return (
    customId.startsWith(`${WELCOME_BUTTON_SETUP}:`) ||
    customId.startsWith(`${WELCOME_BUTTON_FIRST_RAID}:`)
  );
}

export function isWelcomeSelect(customId: string): boolean {
  return customId.startsWith(`${WELCOME_SELECT_TIMEZONE}:`);
}

function guildIdFrom(customId: string): string {
  return customId.split(':')[1] ?? '';
}

async function guildLanguage(guildId: string): Promise<string> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  return guild?.language || 'en';
}

/**
 * Reply used when a button is pressed in a DM, where nothing guild-scoped can run.
 *
 * Links straight to the server rather than just naming it, so "back into the
 * server" is one tap rather than a hunt through the sidebar.
 */
async function replyOpenInServer(
  interaction: ButtonInteraction,
  guildId: string,
  language: string,
  command: string
): Promise<void> {
  const guildName = interaction.client.guilds.cache.get(guildId)?.name ?? guildId;

  await interaction.reply({
    content:
      t(language, 'welcomeOpenInServer', { guild: guildName, command }) +
      `\nhttps://discord.com/channels/${guildId}`,
    ephemeral: true,
  });
}

export async function routeWelcomeButton(interaction: ButtonInteraction): Promise<void> {
  if (interaction.customId.startsWith(`${WELCOME_BUTTON_SETUP}:`)) {
    await handleSetupButton(interaction);
  } else {
    await handleFirstRaidButton(interaction);
  }
}

/**
 * [Start setup] — asks for the one setting that actually has to be right.
 *
 * Only the timezone is asked here. Raid roles are chosen per raid, and leader roles
 * have a working default (the Manage Events permission), so neither belongs in a
 * blocking setup step. This is the "dosiert, wenn es relevant ist" from the issue.
 *
 * Works in a DM: the timezone is a guild-level row, so it can be set without the
 * user being in a guild-context interaction.
 */
async function handleSetupButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = guildIdFrom(interaction.customId);
  const language = await guildLanguage(guildId);

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${WELCOME_SELECT_TIMEZONE}:${guildId}`)
    .setPlaceholder(t(language, 'welcomeSetupTimezonePlaceholder'))
    .addOptions(
      COMMON_TIMEZONES.slice(0, TIMEZONE_CHOICE_LIMIT).map((zone) => ({
        label: formatTimezoneLabel(zone),
        value: zone,
      }))
    );

  await interaction.reply({
    content:
      `${t(language, 'welcomeSetupIntro')}\n\n` +
      `-# ${t(language, 'welcomeSetupLeaderRolesHint')}`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    ephemeral: true,
  });
}

export async function handleTimezoneSelect(
  interaction: StringSelectMenuInteraction
): Promise<void> {
  const guildId = guildIdFrom(interaction.customId);
  const language = await guildLanguage(guildId);
  const timezone = normalizeTimezone(interaction.values[0]);

  if (!timezone) {
    await interaction.update({
      content: '❌ That timezone is not recognised. Use `/config timezone` to set it.',
      components: [],
    });
    return;
  }

  await prisma.guild.update({
    where: { id: guildId },
    data: guildTimezoneUpdate(timezone),
  });

  await interaction.update({
    content: t(language, 'welcomeSetupTimezoneSaved', { zone: formatTimezoneLabel(timezone) }),
    components: [],
  });
}

/**
 * [Create first raid] — the whole point of the welcome message.
 *
 * In a guild this drops straight into the guided modal flow from #38: one click,
 * three fields, done. In a DM there is no channel to post the raid into and no
 * member to authorise, so it points back at the server instead of failing.
 */
async function handleFirstRaidButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = guildIdFrom(interaction.customId);
  const language = await guildLanguage(guildId);

  if (!interaction.guild || !interaction.channel || interaction.guildId !== guildId) {
    await replyOpenInServer(interaction, guildId, language, '/raid create');
    return;
  }

  if (!interaction.member || !(await canManageRaids(interaction.member as any))) {
    await interaction.reply({
      content: '❌ You do not have permission to create raids. Ask your server admin to configure raid leader roles.',
      ephemeral: true,
    });
    return;
  }

  const { startGuidedRaidCreate } = await import('./raidCreateFlow');

  // Reuses the #38 flow verbatim — the button is just another entry point, so the
  // welcome path cannot drift away from what `/raid create` does.
  await startGuidedRaidCreate(interaction, {
    date: null,
    time: null,
    title: null,
    roles: null,
    pingRoles: false,
    teamOption: null,
  });
}
