/**
 * Handlers for the two welcome-message buttons (issue #39) and the setup chain
 * behind [Start setup] (issue #48).
 *
 * The hard constraint here is delivery: the welcome message goes to the guild's
 * system channel, and falls back to a DM to the server owner when there is none or
 * the bot may not post there (#52). In that DM the interaction has **no guild
 * context** — `interaction.guild` is null and the member (and therefore their
 * roles) is unavailable. Both buttons must therefore either work without a guild,
 * or lead the user cleanly back into the server. The guild id rides along in the
 * custom ID so we always know which server "back" means.
 *
 * That split runs straight through the setup chain: timezone and language are plain
 * guild-table columns and can be set from anywhere, but a `RoleSelectMenu` needs a
 * guild to enumerate roles from. Step 3 therefore renders the "open it in the
 * server" pointer instead of a broken menu when there is no guild context.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  RoleSelectMenuBuilder,
  RoleSelectMenuInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import prisma from '../database/client';
import { cleanLeaderRoles, formatLeaderRoles, setLanguage, setLeaderRoles } from '../commands/config';
import { canManageRaids } from '../utils/permissions';
import { SupportedLanguage, t } from '../utils/localization';
import {
  COMMON_TIMEZONES,
  DEFAULT_TIMEZONE,
  formatTimezoneLabel,
  guildTimezoneUpdate,
  normalizeTimezone,
} from '../utils/timezoneHelper';
import { WELCOME_BUTTON_FIRST_RAID, WELCOME_BUTTON_SETUP } from '../utils/welcomeEmbed';

export const WELCOME_SELECT_TIMEZONE = 'welcome-tz';
export const WELCOME_SELECT_LANGUAGE = 'welcome-lang';
export const WELCOME_SELECT_LEADER_ROLES = 'welcome-roles';
/** `welcome-skip:{guildId}:{step}` — one button per step of the chain. */
export const WELCOME_BUTTON_SKIP = 'welcome-skip';

/** Discord allows at most 25 options in a select menu. */
const TIMEZONE_CHOICE_LIMIT = 25;

/** Discord's cap on a role select is 25; ten leader roles is already generous. */
const LEADER_ROLE_LIMIT = 10;

const TOTAL_STEPS = 3;

type SetupStep = 'tz' | 'lang' | 'roles';

/** Every interaction in the chain edits the same ephemeral message. */
type ChainInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | RoleSelectMenuInteraction;

export function isWelcomeButton(customId: string): boolean {
  return (
    customId.startsWith(`${WELCOME_BUTTON_SETUP}:`) ||
    customId.startsWith(`${WELCOME_BUTTON_FIRST_RAID}:`) ||
    customId.startsWith(`${WELCOME_BUTTON_SKIP}:`)
  );
}

export function isWelcomeSelect(customId: string): boolean {
  return (
    customId.startsWith(`${WELCOME_SELECT_TIMEZONE}:`) ||
    customId.startsWith(`${WELCOME_SELECT_LANGUAGE}:`)
  );
}

export function isWelcomeRoleSelect(customId: string): boolean {
  return customId.startsWith(`${WELCOME_SELECT_LEADER_ROLES}:`);
}

function guildIdFrom(customId: string): string {
  return customId.split(':')[1] ?? '';
}

async function guildRow(guildId: string) {
  return prisma.guild.findUnique({ where: { id: guildId } });
}

async function guildLanguage(guildId: string): Promise<string> {
  const guild = await guildRow(guildId);
  return guild?.language || 'en';
}

function languageName(language: string): string {
  return language === 'de' ? 'Deutsch' : 'English';
}

/**
 * Guild name for a write, resolved from the client cache.
 *
 * The setup chain writes through the `/config` helpers, which upsert and therefore
 * need a name for the create branch. In a DM `interaction.guild` is null, so the
 * cache is the only source — and the id is a usable last resort, since the create
 * branch only fires for a guild the bot has never seen.
 */
function guildNameFor(interaction: ChainInteraction, guildId: string): string {
  return interaction.client.guilds.cache.get(guildId)?.name ?? guildId;
}

/** True when the interaction can enumerate roles for *this* guild. */
function hasGuildContext(interaction: ChainInteraction, guildId: string): boolean {
  return Boolean(interaction.guild) && interaction.guildId === guildId;
}

/**
 * Body of the "this only works in the server" pointer.
 *
 * Links straight to the server rather than just naming it, so "back into the
 * server" is one tap rather than a hunt through the sidebar.
 */
function openInServerText(
  interaction: ChainInteraction,
  guildId: string,
  language: string,
  command: string
): string {
  return (
    t(language, 'welcomeOpenInServer', { guild: guildNameFor(interaction, guildId), command }) +
    `\nhttps://discord.com/channels/${guildId}`
  );
}

/** Reply used when a button is pressed in a DM, where nothing guild-scoped can run. */
async function replyOpenInServer(
  interaction: ButtonInteraction,
  guildId: string,
  language: string,
  command: string
): Promise<void> {
  await interaction.reply({
    content: openInServerText(interaction, guildId, language, command),
    ephemeral: true,
  });
}

function stepHeader(language: string, current: number): string {
  return `-# ${t(language, 'welcomeSetupStep', { current, total: TOTAL_STEPS })}`;
}

function skipRow(
  guildId: string,
  step: SetupStep,
  language: string
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${WELCOME_BUTTON_SKIP}:${guildId}:${step}`)
      .setLabel(t(language, 'welcomeSetupSkip'))
      .setStyle(ButtonStyle.Secondary)
  );
}

export async function routeWelcomeButton(interaction: ButtonInteraction): Promise<void> {
  if (interaction.customId.startsWith(`${WELCOME_BUTTON_SETUP}:`)) {
    await handleSetupButton(interaction);
  } else if (interaction.customId.startsWith(`${WELCOME_BUTTON_SKIP}:`)) {
    await handleSkipButton(interaction);
  } else {
    await handleFirstRaidButton(interaction);
  }
}

export async function routeWelcomeSelect(
  interaction: StringSelectMenuInteraction
): Promise<void> {
  if (interaction.customId.startsWith(`${WELCOME_SELECT_TIMEZONE}:`)) {
    await handleTimezoneSelect(interaction);
  } else {
    await handleLanguageSelect(interaction);
  }
}

// ---------------------------------------------------------------------------
// Step 1 — timezone
// ---------------------------------------------------------------------------

/**
 * [Start setup] — the one pass through the three settings that are worth asking for.
 *
 * All three are relevant exactly once per server: the timezone every raid time is
 * read in, the language every message is written in, and who may create raids. Each
 * step is skippable, and each has a working default, so nothing here blocks.
 *
 * Works in a DM up to step 3 — see the module comment.
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
    content: `${stepHeader(language, 1)}\n${t(language, 'welcomeSetupIntro')}`,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      skipRow(guildId, 'tz', language),
    ],
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

  await showLanguageStep(
    interaction,
    guildId,
    language,
    t(language, 'welcomeSetupTimezoneSaved', { zone: formatTimezoneLabel(timezone) })
  );
}

// ---------------------------------------------------------------------------
// Step 2 — language
// ---------------------------------------------------------------------------

/**
 * Renders step 2 in place, under the confirmation of step 1.
 *
 * The current language is preselected rather than merely mentioned: it was guessed
 * from the installer's Discord locale at guild-create time (`localeToLanguage`), and
 * that guess is wrong often enough to be worth putting in front of someone once.
 */
async function showLanguageStep(
  interaction: ChainInteraction,
  guildId: string,
  language: string,
  confirmation: string
): Promise<void> {
  const current = language === 'de' ? 'de' : 'en';

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${WELCOME_SELECT_LANGUAGE}:${guildId}`)
    .setPlaceholder(t(language, 'welcomeSetupLanguagePlaceholder'))
    .addOptions(
      { label: 'English', value: 'en', default: current === 'en' },
      { label: 'Deutsch', value: 'de', default: current === 'de' }
    );

  await interaction.update({
    content:
      `${confirmation}\n\n` +
      `${stepHeader(language, 2)}\n` +
      t(language, 'welcomeSetupLanguageIntro', { detected: languageName(current) }),
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      skipRow(guildId, 'lang', language),
    ],
  });
}

export async function handleLanguageSelect(
  interaction: StringSelectMenuInteraction
): Promise<void> {
  const guildId = guildIdFrom(interaction.customId);
  const chosen = interaction.values[0] === 'de' ? 'de' : 'en';

  await setLanguage(guildId, guildNameFor(interaction, guildId), chosen as SupportedLanguage);

  // Everything from here on renders in the language just chosen — that is the point
  // of asking mid-flow rather than after it.
  await showLeaderRolesStep(
    interaction,
    guildId,
    chosen,
    t(chosen, 'welcomeSetupLanguageSaved', { language: languageName(chosen) })
  );
}

// ---------------------------------------------------------------------------
// Step 3 — leader roles
// ---------------------------------------------------------------------------

/**
 * Renders step 3, or — without guild context — the pointer back into the server.
 *
 * A `RoleSelectMenu` resolves its options against the guild the interaction came
 * from. In a DM there is none, so showing one would produce an empty, unusable menu.
 * The chain ends there with a link and the exact command to run instead.
 */
async function showLeaderRolesStep(
  interaction: ChainInteraction,
  guildId: string,
  language: string,
  confirmation: string
): Promise<void> {
  if (!hasGuildContext(interaction, guildId)) {
    await finishSetup(interaction, guildId, language, [
      confirmation,
      openInServerText(interaction, guildId, language, '/config leader-roles'),
    ]);
    return;
  }

  const select = new RoleSelectMenuBuilder()
    .setCustomId(`${WELCOME_SELECT_LEADER_ROLES}:${guildId}`)
    .setPlaceholder(t(language, 'welcomeSetupLeaderRolesPlaceholder'))
    // Zero is allowed so an empty submit means the same as [Skip]: keep the default.
    .setMinValues(0)
    .setMaxValues(LEADER_ROLE_LIMIT);

  await interaction.update({
    content:
      `${confirmation}\n\n` +
      `${stepHeader(language, 3)}\n` +
      t(language, 'welcomeSetupLeaderRolesIntro'),
    components: [
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select),
      skipRow(guildId, 'roles', language),
    ],
  });
}

export async function handleLeaderRolesSelect(
  interaction: RoleSelectMenuInteraction
): Promise<void> {
  const guildId = guildIdFrom(interaction.customId);
  const language = await guildLanguage(guildId);

  // Role IDs, not names: `canManageRaids` matches either, and an ID survives a
  // rename. `/config view` renders them back as mentions.
  const roleIds = cleanLeaderRoles(interaction.values.join(','));

  if (!roleIds) {
    await finishSetup(interaction, guildId, language, [
      t(language, 'welcomeSetupLeaderRolesSkipped'),
    ]);
    return;
  }

  await setLeaderRoles(guildId, guildNameFor(interaction, guildId), roleIds);

  await finishSetup(interaction, guildId, language, [
    t(language, 'welcomeSetupLeaderRolesSaved', { roles: formatLeaderRoles(roleIds) }),
  ]);
}

// ---------------------------------------------------------------------------
// Skip — every step is optional
// ---------------------------------------------------------------------------

async function handleSkipButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = guildIdFrom(interaction.customId);
  const step = (interaction.customId.split(':')[2] ?? 'roles') as SetupStep;
  const guild = await guildRow(guildId);
  const language = guild?.language || 'en';

  if (step === 'tz') {
    await showLanguageStep(
      interaction,
      guildId,
      language,
      t(language, 'welcomeSetupTimezoneSkipped', {
        zone: formatTimezoneLabel(guild?.timezone || DEFAULT_TIMEZONE),
      })
    );
    return;
  }

  if (step === 'lang') {
    await showLeaderRolesStep(
      interaction,
      guildId,
      language,
      t(language, 'welcomeSetupLanguageSkipped', { language: languageName(language) })
    );
    return;
  }

  await finishSetup(interaction, guildId, language, [
    t(language, 'welcomeSetupLeaderRolesSkipped'),
  ]);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * Closes the chain with what is now actually stored, read back from the guild row
 * rather than assembled from what happened to be clicked — a skipped step then shows
 * the value that was already there instead of a blank.
 */
async function finishSetup(
  interaction: ChainInteraction,
  guildId: string,
  language: string,
  lines: string[]
): Promise<void> {
  const guild = await guildRow(guildId);
  const leaderRoles = cleanLeaderRoles(guild?.raidLeaderRoles || '');

  const summary = [
    t(language, 'welcomeSetupSummaryTitle'),
    t(language, 'welcomeSetupSummaryTimezone', {
      zone: formatTimezoneLabel(guild?.timezone || DEFAULT_TIMEZONE),
    }),
    t(language, 'welcomeSetupSummaryLanguage', {
      language: languageName(guild?.language || language),
    }),
    leaderRoles
      ? t(language, 'welcomeSetupSummaryLeaderRoles', { roles: formatLeaderRoles(leaderRoles) })
      : t(language, 'welcomeSetupSummaryLeaderRolesDefault'),
    '',
    `-# ${t(language, 'welcomeSetupDone')}`,
  ].join('\n');

  await interaction.update({
    content: `${lines.join('\n\n')}\n\n${summary}`,
    components: [],
  });
}

// ---------------------------------------------------------------------------
// [Create first raid]
// ---------------------------------------------------------------------------

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
