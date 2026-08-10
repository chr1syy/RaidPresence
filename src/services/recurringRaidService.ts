import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Guild as DiscordGuild,
  PermissionsBitField,
} from 'discord.js';
import { Prisma, Raid } from '@prisma/client';
import prisma from '../database/client';
import { createRaidEmbed, parseRoleInput } from '../commands/raid';
import { buildRaidButtonRows } from '../utils/raidComponents';
import { getEffectivePrefsMap } from '../utils/rolePreference';
import { tryConsumeWeeklyRaid } from './entitlementService';
import { DEFAULT_TIMEZONE, nextWeeklyOccurrence } from '../utils/timezoneHelper';
import { t } from '../utils/localization';
import { PREMIUM_COLOR } from '../middleware/premiumGate';
import {
  NUDGE_LOOKBACK_MS,
  NUDGE_TTL_MS,
  RECURRENCE_WEEKLY,
  ZOMBIE_PAUSE_AFTER,
} from '../utils/recurrence';

// Re-exported so callers keep importing recurrence behaviour from one place.
export { NUDGE_LOOKBACK_MS, NUDGE_TTL_MS, RECURRENCE_WEEKLY, ZOMBIE_PAUSE_AFTER };

/**
 * Weekly recurring raids and the post-raid nudge — the two mechanisms that produce a
 * *second* raid week without anyone typing a command.
 *
 * Both end in the same place: "take a raid that just closed and create the same raid one
 * week later, with a freshly resolved roster". That is {@link createFollowUpRaid}; the
 * difference is only who asks for it (the scheduler for a series, a button click for a
 * nudge) and whether the result carries the series forward.
 */

export type FollowUpFailureReason =
  | 'guild_unavailable'
  | 'channel_unavailable'
  | 'no_members'
  | 'weekly_limit'
  | 'date_error'
  | 'duplicate'
  | 'error';

export type FollowUpResult =
  | { ok: true; raidId: string; raidDate: Date; memberCount: number }
  | { ok: false; reason: FollowUpFailureReason; max?: number };

/** How the follow-up relates to the raid it came from. */
export type RecurrenceMode =
  /** One-off follow-up (nudge click) — no series. */
  | 'none'
  /** Carry an existing weekly series forward. */
  | 'inherit'
  /** Start a weekly series at the follow-up. */
  | 'start';

/**
 * Did any player touch this raid at all?
 *
 * `interactedAt` is stamped by every player-driven change (opt-in, opt-out, late, class
 * pick) and by nothing else — an auto-generated roster is entirely null. So "no row has
 * been interacted with" is precisely "this raid was posted and ignored".
 */
export async function hasPlayerInteraction(raidId: string): Promise<boolean> {
  const count = await prisma.raidAttendance.count({
    where: { raidId, interactedAt: { not: null } },
  });
  return count > 0;
}

/** Localized text for a failure, reused by the nudge reply and the pause notice. */
export function followUpFailureMessage(
  result: { reason: FollowUpFailureReason; max?: number },
  language: string,
): string {
  switch (result.reason) {
    case 'channel_unavailable':
    case 'guild_unavailable':
      return t(language, 'followUpFailedChannel');
    case 'no_members':
      return t(language, 'followUpFailedMembers');
    case 'weekly_limit':
      return t(language, 'followUpFailedLimit', { max: String(result.max ?? 5) });
    case 'date_error':
      return t(language, 'followUpFailedDate');
    case 'duplicate':
      return t(language, 'followUpDuplicate');
    default:
      return t(language, 'followUpFailedGeneric');
  }
}

/** Resolves the guild and target channel, or explains why the follow-up cannot be posted. */
async function resolveTarget(
  client: Client,
  source: Raid,
): Promise<
  | { ok: true; guild: DiscordGuild; channel: any }
  | { ok: false; reason: 'guild_unavailable' | 'channel_unavailable' }
> {
  let guild: DiscordGuild;
  try {
    guild = await client.guilds.fetch(source.guildId);
  } catch {
    return { ok: false, reason: 'guild_unavailable' };
  }
  if (!guild) return { ok: false, reason: 'guild_unavailable' };

  let channel: any;
  try {
    channel = await client.channels.fetch(source.channelId);
  } catch {
    // Deleted channel — Discord answers with 10003, which arrives here as a throw.
    return { ok: false, reason: 'channel_unavailable' };
  }

  if (!channel || !channel.isTextBased?.() || typeof channel.send !== 'function') {
    return { ok: false, reason: 'channel_unavailable' };
  }

  // Write permission can be revoked without the channel disappearing. Checked up front so
  // a series pauses instead of failing the same send every two minutes forever.
  try {
    const me = guild.members?.me ?? (await guild.members?.fetchMe?.());
    const perms = me && channel.permissionsFor ? channel.permissionsFor(me) : null;
    if (
      perms &&
      (!perms.has(PermissionsBitField.Flags.ViewChannel) ||
        !perms.has(PermissionsBitField.Flags.SendMessages))
    ) {
      return { ok: false, reason: 'channel_unavailable' };
    }
  } catch {
    // Permission introspection is best-effort; a failed send below is caught anyway.
  }

  return { ok: true, guild, channel };
}

/**
 * Creates the next instance of `source`, one week later in the guild's timezone.
 *
 * Mirrors `handleCloneRaid` (src/commands/raid.ts) but runs without an interaction, so it
 * can be driven by the scheduler. The roster is resolved fresh against current role
 * membership — members who gained the role since are added, members who left are gone —
 * and no attendance from the source raid is copied: last week's "I'm out" must not decide
 * this week.
 *
 * Idempotent by construction: the successor carries `recurrenceParentId = source.id`, and
 * that column is UNIQUE. A crash between closing a raid and creating its successor is
 * therefore harmless — the retry either creates the one missing raid or is rejected by the
 * database.
 */
export async function createFollowUpRaid(
  client: Client,
  source: Raid,
  options: { mode: RecurrenceMode; silentStreak?: number; createdBy?: string },
): Promise<FollowUpResult> {
  const guildData = await prisma.guild.findUnique({ where: { id: source.guildId } });
  const language = guildData?.language || 'en';
  const timezone = guildData?.timezone || DEFAULT_TIMEZONE;

  // Cheap pre-check so the common "already done" case never burns a weekly raid slot.
  // The UNIQUE index below is what actually guarantees uniqueness under a race.
  const existing = await prisma.raid.findFirst({
    where: { recurrenceParentId: source.id },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: 'duplicate' };

  const raidDate = nextWeeklyOccurrence(source.raidDate, timezone, new Date());
  if (!raidDate) return { ok: false, reason: 'date_error' };

  const target = await resolveTarget(client, source);
  if (!target.ok) return { ok: false, reason: target.reason };
  const { guild, channel } = target;

  // Fresh roster from current role membership.
  const { validIds: roleIds } = parseRoleInput(source.roles, guild);
  try {
    await guild.members.fetch();
  } catch (error) {
    console.error(`Recurrence: failed to fetch members for guild ${source.guildId}:`, error);
    return { ok: false, reason: 'error' };
  }

  const eligibleMembers: string[] = [];
  for (const [memberId, member] of guild.members.cache) {
    if (member.user.bot) continue;
    const hasRaidRole = member.roles.cache.some(
      (role: { id: string; name: string }) => roleIds.includes(role.id) || roleIds.includes(role.name),
    );
    if (hasRaidRole) eligibleMembers.push(memberId);
  }

  if (eligibleMembers.length === 0) return { ok: false, reason: 'no_members' };

  for (const userId of eligibleMembers) {
    const member = guild.members.cache.get(userId);
    if (!member) continue;
    await prisma.userPreference.upsert({
      where: { userId_guildId: { userId, guildId: guild.id } },
      update: { username: member.displayName },
      create: { userId, guildId: guild.id, username: member.displayName },
    });
  }

  const memberRolesMap = new Map<string, string[]>();
  for (const userId of eligibleMembers) {
    const member = guild.members.cache.get(userId);
    if (member) {
      memberRolesMap.set(userId, Array.from(member.roles.cache.values()).map((r: any) => r.id));
    }
  }
  const prefsMap = await getEffectivePrefsMap(eligibleMembers, guild.id, roleIds, memberRolesMap);

  // Automatically created raids consume the free weekly allowance exactly like manual
  // ones. A series that silently bypassed the limit would make the limit meaningless and
  // hide the very signal (guilds pressing against it) the tier decision depends on.
  const { allowed, max } = await tryConsumeWeeklyRaid(guild.id);
  if (!allowed) return { ok: false, reason: 'weekly_limit', max };

  const recurrenceRule =
    options.mode === 'inherit'
      ? source.recurrenceRule ?? RECURRENCE_WEEKLY
      : options.mode === 'start'
      ? RECURRENCE_WEEKLY
      : null;

  let newRaid;
  try {
    newRaid = await prisma.raid.create({
      data: {
        guildId: guild.id,
        teamId: source.teamId,
        channelId: channel.id,
        raidDate,
        description: source.description,
        roles: source.roles,
        createdBy: options.createdBy ?? source.createdBy,
        createdFromTemplateId: source.id,
        clonedAt: new Date(),
        recurrenceParentId: source.id,
        recurrenceRule,
        recurrenceActive: true,
        recurrenceSilentStreak: options.silentStreak ?? 0,
      },
    });
  } catch (error) {
    // P2002 on `recurrenceParentId`: a concurrent scheduler tick won the race. The other
    // run created exactly the raid this one would have, so this is a success elsewhere.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, reason: 'duplicate' };
    }
    throw error;
  }

  await prisma.raidAttendance.createMany({
    data: eligibleMembers.map((userId) => {
      const member = guild.members.cache.get(userId);
      const pref = prefsMap.get(userId);
      return {
        raidId: newRaid.id,
        teamId: source.teamId,
        userId,
        guildId: guild.id,
        username: member?.displayName || 'Unknown',
        status: 'attending' as const,
        wowClass: pref?.wowClass || null,
        wowSpec: pref?.wowSpec || null,
      };
    }),
  });

  const embed = await createRaidEmbed(newRaid.id, language);
  const components = buildRaidButtonRows(newRaid.id, language);

  try {
    const message = await channel.send({ embeds: [embed], components });
    await prisma.raid.update({
      where: { id: newRaid.id },
      data: { messageId: message.id },
    });
  } catch (error) {
    // The raid row exists but has no message. Leaving it would post nothing and still
    // block the series (the UNIQUE successor slot is taken), so it is rolled back.
    console.error(`Recurrence: failed to post follow-up raid ${newRaid.id}:`, error);
    await prisma.raid.delete({ where: { id: newRaid.id } }).catch(() => undefined);
    return { ok: false, reason: 'channel_unavailable' };
  }

  return { ok: true, raidId: newRaid.id, raidDate, memberCount: eligibleMembers.length };
}

/**
 * Stops the series at `raid` and posts a one-time notice with a resume button.
 *
 * The flag lives on the tail instance because that is where the scheduler looks: an
 * inactive tail produces no successor, and the chain simply ends.
 */
export async function pauseSeries(
  client: Client,
  raid: Raid,
  notice: { text: string; language: string } | null,
): Promise<void> {
  await prisma.raid.update({
    where: { id: raid.id },
    data: { recurrenceActive: false },
  });

  if (!notice) return;

  try {
    const channel: any = await client.channels.fetch(raid.channelId);
    if (!channel?.isTextBased?.() || typeof channel.send !== 'function') return;

    const embed = new EmbedBuilder()
      .setColor(PREMIUM_COLOR)
      .setTitle(t(notice.language, 'recurringPausedTitle'))
      .setDescription(notice.text);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`raid_resume_${raid.id}`)
        .setLabel(t(notice.language, 'recurringResumeButton'))
        .setStyle(ButtonStyle.Primary),
    );

    await channel.send({ embeds: [embed], components: [row] });
  } catch (error) {
    // A pause must never depend on being able to announce itself — the channel being
    // gone is one of the reasons we pause in the first place.
    console.error(`Recurrence: could not post pause notice for raid ${raid.id}:`, error);
  }
}

/**
 * Carries one closed series raid forward: zombie check, then create the next instance,
 * pausing the series instead of retrying forever when it cannot.
 *
 * Shared by the scheduler and the [Resume] button so both behave identically.
 */
export async function advanceSeries(client: Client, raid: Raid): Promise<FollowUpResult> {
  const guildData = await prisma.guild.findUnique({
    where: { id: raid.guildId },
    select: { language: true },
  });
  const language = guildData?.language || 'en';
  const title = raid.description || 'Raid';

  // Silent-streak bookkeeping: only *auto-generated* instances count. The raid a leader
  // created by hand is engagement by definition, so a series always gets N fresh chances.
  const wasAutoGenerated = raid.recurrenceParentId !== null;
  const interacted = await hasPlayerInteraction(raid.id);
  const nextStreak = wasAutoGenerated && !interacted ? raid.recurrenceSilentStreak + 1 : 0;

  if (nextStreak >= ZOMBIE_PAUSE_AFTER) {
    await pauseSeries(client, raid, {
      language,
      text: t(language, 'recurringPausedSilent', { count: String(nextStreak), title }),
    });
    console.log(`⏸️ Paused zombie raid series after ${nextStreak} silent instances (${raid.id})`);
    return { ok: false, reason: 'error' };
  }

  const result = await createFollowUpRaid(client, raid, {
    mode: 'inherit',
    silentStreak: nextStreak,
  });

  if (result.ok) {
    console.log(
      `🔁 Created recurring follow-up raid ${result.raidId} from ${raid.id} (${result.memberCount} members)`,
    );
    return result;
  }

  switch (result.reason) {
    case 'duplicate':
      // Already handled by an earlier tick — nothing to do, and definitely nothing to pause.
      return result;
    case 'weekly_limit':
      await pauseSeries(client, raid, {
        language,
        text: t(language, 'recurringPausedLimit', { title, max: String(result.max ?? 5) }),
      });
      console.log(`⏸️ Paused raid series ${raid.id}: weekly raid limit reached`);
      return result;
    case 'no_members':
      await pauseSeries(client, raid, {
        language,
        text: t(language, 'recurringPausedNoMembers', { title }),
      });
      console.log(`⏸️ Paused raid series ${raid.id}: no eligible members`);
      return result;
    case 'channel_unavailable':
    case 'guild_unavailable':
      // No notice: there is nowhere to post it. Pausing stops the two-minute error loop.
      await pauseSeries(client, raid, null);
      console.log(`⏸️ Paused raid series ${raid.id}: channel gone or not writable`);
      return result;
    default:
      console.error(`Recurrence: could not advance series ${raid.id} (${result.reason})`);
      return result;
  }
}

/**
 * Posts the one-time "same time next week?" prompt under a raid that just closed.
 *
 * `nudgeSentAt` is stamped even when the message could not be delivered: the point of the
 * column is "this raid has had its one attempt", not "a message exists". Without that, a
 * raid in a deleted channel would be retried every two minutes forever.
 */
export async function sendPostRaidNudge(client: Client, raid: Raid): Promise<boolean> {
  const guildData = await prisma.guild.findUnique({
    where: { id: raid.guildId },
    select: { language: true },
  });
  const language = guildData?.language || 'en';

  let messageId: string | null = null;
  try {
    const channel: any = await client.channels.fetch(raid.channelId);
    if (channel?.isTextBased?.() && typeof channel.send === 'function') {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`raid_nudge_${raid.id}`)
          .setLabel(t(language, 'nudgeButton'))
          .setStyle(ButtonStyle.Success),
      );

      const message = await channel.send({
        content: t(language, 'nudgePrompt', { title: raid.description || 'Raid' }),
        components: [row],
      });
      messageId = message.id;
    }
  } catch (error) {
    console.error(`Nudge: could not post for raid ${raid.id}:`, error);
  }

  await prisma.raid.update({
    where: { id: raid.id },
    data: { nudgeSentAt: new Date(), nudgeMessageId: messageId },
  });

  return messageId !== null;
}

/** Strips the button from a nudge message and forgets it (click or 48h expiry). */
export async function retireNudge(client: Client, raid: Pick<Raid, 'id' | 'channelId' | 'nudgeMessageId'>): Promise<void> {
  const messageId = raid.nudgeMessageId;

  await prisma.raid.update({
    where: { id: raid.id },
    data: { nudgeMessageId: null },
  });

  if (!messageId) return;

  try {
    const channel: any = await client.channels.fetch(raid.channelId);
    if (!channel?.isTextBased?.() || !('messages' in channel)) return;
    const message = await channel.messages.fetch(messageId);
    await message.edit({ components: [] });
  } catch (error) {
    // A deleted message or channel is the normal end state here, not a problem.
    console.error(`Nudge: could not retire message for raid ${raid.id}:`, error);
  }
}

/**
 * Follows the successor chain from any instance to the raid that currently drives the
 * series, so `/raid recurring stop <any id of the series>` does the obvious thing.
 *
 * The hop limit is a cycle guard: the schema cannot express one, but a hand-edited row
 * should not be able to hang the command.
 */
export async function resolveSeriesTail(raidId: string): Promise<Raid | null> {
  let current = await prisma.raid.findUnique({ where: { id: raidId } });
  if (!current) return null;

  for (let hop = 0; hop < 500; hop++) {
    const child: Raid | null = await prisma.raid.findFirst({
      where: { recurrenceParentId: current!.id },
    });
    if (!child) return current;
    current = child;
  }
  return current;
}
