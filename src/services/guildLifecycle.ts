import prisma from '../database/client';

/**
 * Tracking of guild joins and departures.
 *
 * The bot never deletes a `Guild` row when it is kicked — raids, teams and user
 * preferences hang off it via `ON DELETE CASCADE`, and a re-install would lose a
 * server's entire history. The row therefore outlives the install, and `leftAt` is
 * the only thing that separates the two states: NULL means the bot is in the guild,
 * a timestamp means it is out.
 *
 * `leftAt` records when the departure was *detected*. A live `guildDelete` is exact
 * to the second; a departure found by the startup reconciliation is stamped at boot
 * and can be arbitrarily late. See the comment on the schema field.
 */

/** The minimal shape both `guildCreate` and `guildDelete` supply. */
export interface GuildLifecyclePayload {
  id: string;
  name: string;
  /**
   * discord.js sets this to `false` while a guild is unreachable due to an outage.
   * `undefined` is treated as available — partial payloads default to the live case.
   */
  available?: boolean;
}

export interface GuildJoinResult {
  /** True when the row already existed with a `leftAt` set, i.e. this is a re-install. */
  rejoined: boolean;
  /** The previous `leftAt`, or null for a first install or an uninterrupted row. */
  previousLeftAt: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Writes the guild row for a join (or a startup sync) and clears any departure mark.
 *
 * Upsert, so a re-install never throws and never clobbers the server's existing
 * configuration. `leftAt: null` in the update branch is what makes a returning guild
 * count as live again.
 *
 * @returns whether this was a re-install, plus how long the guild had been gone.
 */
export async function syncGuildOnJoin(
  guild: GuildLifecyclePayload,
  options: { now?: Date } = {},
): Promise<GuildJoinResult> {
  const now = options.now ?? new Date();

  // Read before the write: the upsert clears `leftAt`, so afterwards there is no way
  // to tell a re-install from a plain sync. A stale read is harmless here — it only
  // decides whether a log line is printed, never what is written.
  const existing = await prisma.guild.findUnique({
    where: { id: guild.id },
    select: { leftAt: true },
  });

  await prisma.guild.upsert({
    where: { id: guild.id },
    update: {
      name: guild.name,
      // The bot is demonstrably in this guild right now, so any departure mark —
      // from a real kick or from a reconciliation pass — is obsolete.
      leftAt: null,
    },
    create: {
      id: guild.id,
      name: guild.name,
      raidRoles: process.env.RAID_ROLES || '',
      raidLeaderRoles: process.env.RAID_LEADER_ROLES || '',
    },
  });

  const previousLeftAt = existing?.leftAt ?? null;

  if (previousLeftAt) {
    const days = Math.max(0, Math.round((now.getTime() - previousLeftAt.getTime()) / DAY_MS));
    console.log(
      `♻️ Re-install: ${guild.name} (${guild.id}) is back after ${days} day(s) away ` +
        `(departure detected ${previousLeftAt.toISOString()})`,
    );
  }

  return { rejoined: previousLeftAt !== null, previousLeftAt };
}

/**
 * Marks a guild as departed after a `guildDelete` event.
 *
 * WHY THE `available` CHECK IS THE WHOLE POINT: Discord fires `guildDelete` for two
 * completely different things. One is a real departure (kick, ban, guild deleted).
 * The other is a guild going *temporarily unreachable* during a Discord outage or a
 * gateway node moving — and those arrive with `available === false`, followed later by
 * a `guildCreate` when the guild comes back. Stamping on the second case would let a
 * single Discord incident mark the entire install base as kicked in the space of a few
 * seconds, and because `leftAt` records a detection time there is nothing in the data
 * to undo that with afterwards. The metric would be permanently worthless. So an
 * unavailable guild is logged and nothing else.
 *
 * @returns true when the row was stamped, false when the event was an outage.
 */
export async function markGuildDeparted(
  guild: GuildLifecyclePayload,
  options: { now?: Date } = {},
): Promise<boolean> {
  if (guild.available === false) {
    console.log(
      `⚠️ Guild temporarily unavailable (Discord outage), not marking as departed: ` +
        `${guild.name} (${guild.id})`,
    );
    return false;
  }

  const now = options.now ?? new Date();

  // updateMany, not update: a guildDelete for a guild that was never written (e.g. the
  // bot was removed before the first sync) must not throw P2025 inside an event handler.
  // The `leftAt: null` predicate also makes a duplicate event a no-op instead of moving
  // an already-recorded departure forward.
  await prisma.guild.updateMany({
    where: { id: guild.id, leftAt: null },
    data: { leftAt: now },
  });

  // Nothing is deleted here on purpose: raids, teams and preferences stay untouched so
  // a re-install finds its history intact. The cascade relations are never triggered.
  console.log(`➖ Left guild: ${guild.name} (${guild.id})`);

  return true;
}

/**
 * Stamps every guild row that still looks live but is not in the gateway's cache.
 *
 * Catches the two cases `guildDelete` cannot: kicks that happened while the bot was
 * down, and — on the first boot after this feature ships — every historical kick that
 * was never recorded at all. Those all get the current timestamp, which is correct in
 * the "detected at" sense the field is defined with, but means the first run produces
 * one large same-second batch rather than a real churn history.
 *
 * @param activeGuildIds ids from `client.guilds.cache`.
 * @returns the number of rows newly marked as departed.
 */
export async function reconcileDepartedGuilds(
  activeGuildIds: Iterable<string>,
  options: { now?: Date } = {},
): Promise<number> {
  const ids = [...activeGuildIds];

  // Refuse to run on an empty cache. `notIn: []` matches every row, so a gateway that
  // handed us no guilds — a bad connect, a token problem — would mark the entire
  // install base as departed in one statement. A genuine zero-guild bot loses nothing
  // by skipping: the next real departure is still caught by guildDelete.
  if (ids.length === 0) {
    console.warn('⚠️ Reconciliation skipped: guild cache is empty');
    return 0;
  }

  const now = options.now ?? new Date();

  const { count } = await prisma.guild.updateMany({
    where: { leftAt: null, id: { notIn: ids } },
    data: { leftAt: now },
  });

  if (count > 0) {
    console.log(`🚪 Reconciliation: ${count} guild(s) marked as departed`);
  }

  return count;
}
