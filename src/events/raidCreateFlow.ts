/**
 * Guided `/raid create` flow: modal → role select → preview → confirm.
 *
 * `/raid create` used to demand four free-text parameters in a single slash-command
 * line (date, time, title, roles), with no choices and no native option types. That
 * is the wall 88 of 108 guilds never got past — they installed the bot and never
 * created a raid. This module is the low-friction path; the one-line form still
 * works unchanged for anyone who already knows it (see `handleCreateRaid`).
 *
 * Discord constrains the shape of this flow:
 *   - `showModal()` must be the first response to an interaction, so the fork
 *     happens before any `deferReply()`.
 *   - Modals hold text inputs only. Roles therefore cannot live in the modal and
 *     need a follow-up `RoleSelectMenu`.
 *   - Custom IDs are split on `_` elsewhere in the codebase, and IANA zone names
 *     contain underscores (`America/New_York`). Nothing but an opaque draft id
 *     goes into a custom ID here.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  ModalBuilder,
  ModalSubmitInteraction,
  RoleSelectMenuBuilder,
  RoleSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import prisma from '../database/client';
import { buildRoleMentions, createRaidWithRoster } from '../commands/raid';
import { canManageRaids } from '../utils/permissions';
import { t } from '../utils/localization';
import {
  DEFAULT_TIMEZONE,
  formatInTimezone,
  formatTimezoneLabel,
  guildTimezoneUpdate,
  normalizeTimezone,
  zonedDateTimeToUtc,
} from '../utils/timezoneHelper';

/** Discord invalidates an interaction token after 15 minutes; drafts die with it. */
const DRAFT_TTL_MS = 15 * 60 * 1000;

export const MODAL_DETAILS = 'rcflow-details';
// Distinct from BUTTON_FIXTIME: the button opens this modal, and although the two
// interaction types never collide in dispatch, sharing a literal reads like a bug.
export const MODAL_FIXTIME = 'rcflow-fixtime-modal';
export const SELECT_ROLES = 'rcflow-roles';
export const BUTTON_CONFIRM = 'rcflow-confirm';
export const BUTTON_FIXTIME = 'rcflow-fixtime';
export const BUTTON_PING = 'rcflow-ping';
export const BUTTON_RECUR = 'rcflow-recur';

interface RaidDraft {
  guildId: string;
  userId: string;
  channelId: string;
  date: string;
  time: string;
  title: string;
  roleIds: string[];
  pingRoles: boolean;
  /** Weekly series — see services/recurringRaidService. */
  recurring: boolean;
  teamOption: string | null;
  createdAt: number;
}

/**
 * In-memory draft store.
 *
 * Deliberately not a database table: a draft is meaningless once the interaction
 * token expires (15 min), so persisting it would add a migration and a cleanup job
 * to store rows that can never be used again. The trade-off is that drafts do not
 * survive a bot restart — the user sees "session expired" and re-runs the command.
 * This assumes a single bot process, which is how RaidPresence is deployed.
 */
const drafts = new Map<string, RaidDraft>();

function pruneExpiredDrafts(now: number): void {
  for (const [id, draft] of drafts) {
    if (now - draft.createdAt > DRAFT_TTL_MS) drafts.delete(id);
  }
}

/** Opaque, collision-free draft id. Contains no `_` so custom-ID splitting is safe. */
let draftCounter = 0;
function newDraftId(): string {
  draftCounter = (draftCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `d${Date.now().toString(36)}${draftCounter.toString(36)}`;
}

function putDraft(draft: Omit<RaidDraft, 'createdAt'>): string {
  const now = Date.now();
  pruneExpiredDrafts(now);
  const id = newDraftId();
  drafts.set(id, { ...draft, createdAt: now });
  return id;
}

function getDraft(id: string, userId: string): RaidDraft | null {
  pruneExpiredDrafts(Date.now());
  const draft = drafts.get(id);
  if (!draft) return null;
  // A custom ID is visible to anyone who can see the message; never act on someone
  // else's draft.
  if (draft.userId !== userId) return null;
  return draft;
}

/** Exposed for tests — the store is module-level state. */
export function __clearDrafts(): void {
  drafts.clear();
}

async function guildTimezone(guildId: string): Promise<string> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  return guild?.timezone || DEFAULT_TIMEZONE;
}

/** Both settings the preview needs, in one query. */
async function guildSettings(guildId: string): Promise<{ timezone: string; language: string }> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  return {
    timezone: guild?.timezone || DEFAULT_TIMEZONE,
    language: guild?.language || 'en',
  };
}

/**
 * Suggests a sensible default date/time for the modal: the next occurrence of 20:00
 * in the guild's zone, so a raid leader can submit the form without typing anything
 * beyond a title.
 */
function defaultDateTime(timezone: string, now: Date = new Date()): { date: string; time: string } {
  const today = formatInTimezone(now, timezone);
  const todayAt20 = zonedDateTimeToUtc(today.date, '20:00', timezone);

  if (todayAt20 && todayAt20 > now) return { date: today.date, time: '20:00' };

  const tomorrow = formatInTimezone(new Date(now.getTime() + 24 * 60 * 60 * 1000), timezone);
  return { date: tomorrow.date, time: '20:00' };
}

// ---------------------------------------------------------------------------
// Step 1 — the modal
// ---------------------------------------------------------------------------

/**
 * Entry point for the guided flow.
 *
 * Reached from `/raid create` and from the welcome message's [Create first raid]
 * button (#39) — both are interactions that have not yet been replied to, which is
 * all `showModal()` requires.
 */
export async function startGuidedRaidCreate(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  prefill: {
    date: string | null;
    time: string | null;
    title: string | null;
    roles: string | null;
    pingRoles: boolean;
    /** Optional: the welcome-message entry point has no command options to carry it. */
    recurring?: boolean;
    teamOption: string | null;
  }
): Promise<void> {
  if (!interaction.guild || !interaction.channel) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  const timezone = await guildTimezone(interaction.guild.id);
  const fallback = defaultDateTime(timezone);

  // The draft is created up front so the modal's custom ID can carry it. Roles are
  // filled in at the select step; anything passed on the command line is preserved.
  const draftId = putDraft({
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    channelId: interaction.channel.id,
    date: prefill.date ?? fallback.date,
    time: prefill.time ?? fallback.time,
    title: prefill.title ?? '',
    roleIds: [],
    pingRoles: prefill.pingRoles,
    recurring: prefill.recurring ?? false,
    teamOption: prefill.teamOption,
  });

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_DETAILS}:${draftId}`)
    .setTitle('Create a raid')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Raid name')
          .setPlaceholder('Heroic Raid Night')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setValue(prefill.title ?? '')
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('date')
          .setLabel('Date (YYYY-MM-DD)')
          .setStyle(TextInputStyle.Short)
          .setValue(prefill.date ?? fallback.date)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('time')
          .setLabel(`Time (HH:MM, ${timezone})`)
          .setStyle(TextInputStyle.Short)
          .setValue(prefill.time ?? fallback.time)
          .setRequired(true)
      )
    );

  await interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// Step 2 — modal submit, then the role picker
// ---------------------------------------------------------------------------

export async function handleDetailsSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const draftId = interaction.customId.split(':')[1];
  const draft = getDraft(draftId, interaction.user.id);

  if (!draft) {
    await interaction.reply({
      content: '⏱️ This setup has expired. Run `/raid create` again — it only takes a moment.',
      ephemeral: true,
    });
    return;
  }

  const title = interaction.fields.getTextInputValue('title').trim();
  const date = interaction.fields.getTextInputValue('date').trim();
  const time = interaction.fields.getTextInputValue('time').trim();

  const timezone = await guildTimezone(draft.guildId);
  const raidDate = zonedDateTimeToUtc(date, time, timezone);

  if (!raidDate) {
    await interaction.reply({
      content:
        `❌ \`${date} ${time}\` is not a valid date and time.\n` +
        'Use `YYYY-MM-DD` for the date and `HH:MM` (24h) for the time — for example ' +
        '`2026-08-14` and `20:00`. Run `/raid create` to try again.',
      ephemeral: true,
    });
    return;
  }

  if (raidDate < new Date()) {
    await interaction.reply({
      content: '❌ That is in the past. Run `/raid create` again and pick a future date.',
      ephemeral: true,
    });
    return;
  }

  draft.title = title;
  draft.date = date;
  draft.time = time;

  const select = new RoleSelectMenuBuilder()
    .setCustomId(`${SELECT_ROLES}:${draftId}`)
    .setPlaceholder('Which roles are raiding?')
    .setMinValues(1)
    .setMaxValues(10);

  await interaction.reply({
    content:
      `**${title}** — <t:${Math.floor(raidDate.getTime() / 1000)}:F>\n\n` +
      'Now pick the roles whose members should be on the roster. ' +
      'Everyone with those roles is signed up automatically and only has to opt *out*.',
    components: [new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select)],
    ephemeral: true,
  });
}

// ---------------------------------------------------------------------------
// Step 3 — role select, then the preview
// ---------------------------------------------------------------------------

export async function handleRoleSelect(interaction: RoleSelectMenuInteraction): Promise<void> {
  const draftId = interaction.customId.split(':')[1];
  const draft = getDraft(draftId, interaction.user.id);

  if (!draft) {
    await interaction.update({
      content: '⏱️ This setup has expired. Run `/raid create` again — it only takes a moment.',
      components: [],
    });
    return;
  }

  draft.roleIds = [...interaction.values];

  await showPreview(interaction, draftId, draft);
}

/**
 * The confirmation preview.
 *
 * `<t:unix:F>` renders in the *viewer's* own Discord timezone, so a raid leader
 * whose guild zone is wrong sees it here — immediately — instead of discovering it
 * three days later when nobody shows up. That is what makes the zone setting
 * self-correcting, and it is why issue #37 deferred this piece to this flow.
 */
async function showPreview(
  interaction: RoleSelectMenuInteraction | ModalSubmitInteraction | ButtonInteraction,
  draftId: string,
  draft: RaidDraft
): Promise<void> {
  const { timezone, language } = await guildSettings(draft.guildId);
  const raidDate = zonedDateTimeToUtc(draft.date, draft.time, timezone)!;
  const unix = Math.floor(raidDate.getTime() / 1000);

  const hasRoles = draft.roleIds.length > 0;

  // Resolved against the guild so the preview shows exactly the mentions that will
  // go out — a role deleted since the select drops out here rather than at post time.
  const mentions = interaction.guild
    ? buildRoleMentions(interaction.guild, draft.roleIds)
    : draft.roleIds.map((id) => `<@&${id}>`).join(' ');

  const embed = new EmbedBuilder()
    .setTitle(`📋 ${draft.title}`)
    .setColor(0x00ae86)
    .setDescription(
      `**When:** <t:${unix}:F> (<t:${unix}:R>)\n` +
      `**Roles:** ${draft.roleIds.map((id) => `<@&${id}>`).join(' ')}\n` +
      (draft.pingRoles && hasRoles
        ? `${t(language, 'raidCreatePingEnabled', { roles: mentions })}\n`
        : `${t(language, 'raidCreatePingDisabled')}\n`) +
      (draft.recurring ? `${t(language, 'recurringPreviewEnabled')}\n` : '') +
      `\n_Entered as ${draft.time} in ${formatTimezoneLabel(timezone)}. ` +
      'The time above is shown in your own Discord timezone — if it looks wrong, ' +
      'fix the server timezone below._'
    );

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BUTTON_CONFIRM}:${draftId}`)
      .setLabel('Create raid')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${BUTTON_FIXTIME}:${draftId}`)
      .setLabel('Fix time / timezone')
      .setStyle(ButtonStyle.Secondary),
    // Nothing to ping without roles, so the toggle is dead weight rather than a
    // control that flips a flag with no effect.
    new ButtonBuilder()
      .setCustomId(`${BUTTON_PING}:${draftId}`)
      .setLabel(t(language, draft.pingRoles ? 'raidCreatePingOn' : 'raidCreatePingOff'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasRoles),
    // The weekly toggle sits next to the ping toggle because it answers the same kind of
    // question — what happens *around* this raid — and because a series that could only be
    // started from the one-line command form would never be discovered.
    new ButtonBuilder()
      .setCustomId(`${BUTTON_RECUR}:${draftId}`)
      .setLabel(t(language, draft.recurring ? 'recurringToggleOn' : 'recurringToggleOff'))
      .setStyle(ButtonStyle.Secondary)
  );

  const payload = { content: '', embeds: [embed], components: [buttons] };

  if (interaction.isModalSubmit()) {
    await interaction.reply({ ...payload, ephemeral: true });
  } else {
    await interaction.update(payload);
  }
}

// ---------------------------------------------------------------------------
// Step 3b — the ping toggle
// ---------------------------------------------------------------------------

/**
 * Flips `draft.pingRoles` and re-renders the preview.
 *
 * The question — should the chosen roles get a notification? — only becomes
 * answerable once the roles are chosen, and it has no defensible default: a regular
 * weekly raid usually should not ping, a short-notice replacement mostly should. The
 * slash option `ping_roles:true` still sets the prefill, so this toggle starts at
 * whatever the command line said and can still be flipped.
 *
 * Touches the in-memory draft only — nothing is persisted before [Create raid].
 */
export async function handlePingToggle(interaction: ButtonInteraction): Promise<void> {
  const draftId = interaction.customId.split(':')[1];
  const draft = getDraft(draftId, interaction.user.id);

  if (!draft) {
    await interaction.update({
      content: '⏱️ This setup has expired. Run `/raid create` again — it only takes a moment.',
      embeds: [],
      components: [],
    });
    return;
  }

  // The button is rendered disabled without roles; this guards the case where the
  // click and the render race each other.
  if (draft.roleIds.length === 0) {
    await interaction.deferUpdate();
    return;
  }

  draft.pingRoles = !draft.pingRoles;

  await showPreview(interaction, draftId, draft);
}

/**
 * Flips `draft.recurring` and re-renders the preview.
 *
 * Purely in-memory like the ping toggle — nothing is written before [Create raid].
 */
export async function handleRecurringToggle(interaction: ButtonInteraction): Promise<void> {
  const draftId = interaction.customId.split(':')[1];
  const draft = getDraft(draftId, interaction.user.id);

  if (!draft) {
    await interaction.update({
      content: '⏱️ This setup has expired. Run `/raid create` again — it only takes a moment.',
      embeds: [],
      components: [],
    });
    return;
  }

  draft.recurring = !draft.recurring;

  await showPreview(interaction, draftId, draft);
}

// ---------------------------------------------------------------------------
// Step 4a — "Fix time / timezone"
// ---------------------------------------------------------------------------

export async function handleFixTimeButton(interaction: ButtonInteraction): Promise<void> {
  const draftId = interaction.customId.split(':')[1];
  const draft = getDraft(draftId, interaction.user.id);

  if (!draft) {
    await interaction.update({
      content: '⏱️ This setup has expired. Run `/raid create` again — it only takes a moment.',
      embeds: [],
      components: [],
    });
    return;
  }

  const timezone = await guildTimezone(draft.guildId);

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_FIXTIME}:${draftId}`)
    .setTitle('Fix time / timezone')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('date')
          .setLabel('Date (YYYY-MM-DD)')
          .setStyle(TextInputStyle.Short)
          .setValue(draft.date)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('time')
          .setLabel('Time (HH:MM, 24h)')
          .setStyle(TextInputStyle.Short)
          .setValue(draft.time)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('timezone')
          .setLabel('Server timezone (IANA)')
          .setPlaceholder('Europe/Berlin')
          .setStyle(TextInputStyle.Short)
          .setValue(timezone)
          .setRequired(true)
      )
    );

  await interaction.showModal(modal);
}

export async function handleFixTimeSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const draftId = interaction.customId.split(':')[1];
  const draft = getDraft(draftId, interaction.user.id);

  if (!draft) {
    await interaction.reply({
      content: '⏱️ This setup has expired. Run `/raid create` again — it only takes a moment.',
      ephemeral: true,
    });
    return;
  }

  const date = interaction.fields.getTextInputValue('date').trim();
  const time = interaction.fields.getTextInputValue('time').trim();
  const zoneInput = interaction.fields.getTextInputValue('timezone').trim();

  const timezone = normalizeTimezone(zoneInput);
  if (!timezone) {
    await interaction.reply({
      content:
        `❌ \`${zoneInput}\` is not a known timezone. Use an IANA name such as ` +
        '`Europe/Berlin`, `America/New_York` or `UTC`, then press ' +
        '**Fix time / timezone** again.',
      ephemeral: true,
    });
    return;
  }

  const raidDate = zonedDateTimeToUtc(date, time, timezone);
  if (!raidDate) {
    await interaction.reply({
      content: `❌ \`${date} ${time}\` is not a valid date and time. Use \`YYYY-MM-DD\` and \`HH:MM\`.`,
      ephemeral: true,
    });
    return;
  }

  if (raidDate < new Date()) {
    await interaction.reply({
      content: '❌ That is in the past. Press **Fix time / timezone** again and pick a future date.',
      ephemeral: true,
    });
    return;
  }

  // Persist the corrected zone for the guild — the whole point of surfacing the
  // preview is that fixing it once fixes every future raid.
  await prisma.guild.update({
    where: { id: draft.guildId },
    data: guildTimezoneUpdate(timezone),
  });

  draft.date = date;
  draft.time = time;

  await showPreview(interaction, draftId, draft);
}

// ---------------------------------------------------------------------------
// Step 4b — "Create raid"
// ---------------------------------------------------------------------------

export async function handleConfirmButton(interaction: ButtonInteraction): Promise<void> {
  const draftId = interaction.customId.split(':')[1];
  const draft = getDraft(draftId, interaction.user.id);

  if (!draft) {
    await interaction.update({
      content: '⏱️ This setup has expired. Run `/raid create` again — it only takes a moment.',
      embeds: [],
      components: [],
    });
    return;
  }

  await interaction.deferUpdate();

  // Re-check permissions at the point of the write: roles can change between opening
  // the flow and confirming it.
  if (!interaction.member || !(await canManageRaids(interaction.member as any))) {
    await interaction.editReply({
      content: '❌ You do not have permission to create raids.',
      embeds: [],
      components: [],
    });
    return;
  }

  const guild = interaction.guild as Guild | null;
  const channel = guild ? guild.channels.cache.get(draft.channelId) : null;

  if (!guild || !channel) {
    await interaction.editReply({
      content: '❌ The channel this raid was started in is no longer available.',
      embeds: [],
      components: [],
    });
    return;
  }

  const guildData = await prisma.guild.findUnique({ where: { id: draft.guildId } });
  const timezone = guildData?.timezone || DEFAULT_TIMEZONE;
  const raidDate = zonedDateTimeToUtc(draft.date, draft.time, timezone);

  if (!raidDate || raidDate < new Date()) {
    await interaction.editReply({
      content: '❌ That raid time is no longer in the future. Run `/raid create` again.',
      embeds: [],
      components: [],
    });
    return;
  }

  // Clear the draft before the write so a double-click cannot create two raids.
  drafts.delete(draftId);

  await interaction.editReply({ content: '⏳ Creating the raid…', embeds: [], components: [] });

  await createRaidWithRoster(interaction, {
    guild,
    channel: channel as any,
    createdBy: draft.userId,
    title: draft.title,
    raidDate,
    roleIds: draft.roleIds,
    pingRoles: draft.pingRoles,
    recurring: draft.recurring,
    teamOption: draft.teamOption,
    language: guildData?.language || 'en',
    rolesLabel: draft.roleIds.map((id) => `<@&${id}>`).join(', '),
  });
}

// ---------------------------------------------------------------------------
// Dispatch helpers — keep the customId prefixes in one place
// ---------------------------------------------------------------------------

export function isFlowModal(customId: string): boolean {
  return customId.startsWith(`${MODAL_DETAILS}:`) || customId.startsWith(`${MODAL_FIXTIME}:`);
}

export function isFlowButton(customId: string): boolean {
  return (
    customId.startsWith(`${BUTTON_CONFIRM}:`) ||
    customId.startsWith(`${BUTTON_FIXTIME}:`) ||
    customId.startsWith(`${BUTTON_PING}:`) ||
    customId.startsWith(`${BUTTON_RECUR}:`)
  );
}

export function isFlowRoleSelect(customId: string): boolean {
  return customId.startsWith(`${SELECT_ROLES}:`);
}

export async function routeFlowModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId.startsWith(`${MODAL_DETAILS}:`)) {
    await handleDetailsSubmit(interaction);
  } else {
    await handleFixTimeSubmit(interaction);
  }
}

export async function routeFlowButton(interaction: ButtonInteraction): Promise<void> {
  if (interaction.customId.startsWith(`${BUTTON_CONFIRM}:`)) {
    await handleConfirmButton(interaction);
  } else if (interaction.customId.startsWith(`${BUTTON_PING}:`)) {
    await handlePingToggle(interaction);
  } else if (interaction.customId.startsWith(`${BUTTON_RECUR}:`)) {
    await handleRecurringToggle(interaction);
  } else {
    await handleFixTimeButton(interaction);
  }
}
