import { Prisma } from '@prisma/client';
import prisma from '../database/client';
import { invalidateTierCache } from './entitlementService';
import { GuildLifecyclePayload, syncGuildOnJoin } from './guildLifecycle';

/**
 * REVIEW DRAFT: deliberately not registered in index.ts. Do not use this as a
 * backfill/purge API. Only an actual Events.GuildDelete may call remove(); cache
 * absence, leftAt, failed REST requests and GuildUnavailable are not confirmations.
 * See docs/guild-data-deletion.md for the activation blockers and required callers.
 */
export type GuildRemovalResult =
  | { status: 'deleted'; guilds: number; raids: number }
  | { status: 'absent' | 'legacy_retained' };

export class GuildRemovalIsolationError extends Error {
  constructor() {
    super('Guild removal refused: cross-guild references require separate review');
    this.name = 'GuildRemovalIsolationError';
  }
}

/** Internal to the coordinator: callers cannot turn historical leftAt into a purge. */
async function deleteConfirmedGuild(guildId: string): Promise<GuildRemovalResult> {
  const result = await prisma.$transaction(async (tx): Promise<GuildRemovalResult> => {
    // Serialize against writes to the guild and its FK children. Existing raid
    // writers can also lock Raid first; PostgreSQL may abort a deadlock. Propagate
    // that failure (atomic rollback), never retry against an unverified install.
    const rows = await tx.$queryRaw<Array<{ leftAt: Date | null }>>`
      SELECT "leftAt" FROM "Guild" WHERE "id" = ${guildId} FOR UPDATE
    `;
    if (!rows.length) return { status: 'absent' };
    if (rows[0].leftAt !== null) return { status: 'legacy_retained' };

    // The schema has independent FKs, not composite guild-ownership FKs. Refuse
    // inconsistent rows rather than cascading into another guild or SET NULL-ing
    // a surviving guild's recurrence pointer. createdFromTemplateId is a scalar
    // without an FK, so inspect its inbound references explicitly as well.
    const targetRaids = await tx.raid.findMany({ where: { guildId }, select: { id: true } });
    const raidIds = targetRaids.map((raid) => raid.id);
    const targetTeams = await tx.team.findMany({ where: { guildId }, select: { id: true } });
    const foreignRaids = await tx.raid.count({
      where: {
        guildId: { not: guildId },
        OR: [
          { team: { guildId } },
          { recurrenceParentId: { in: raidIds } },
          { createdFromTemplateId: { in: raidIds } },
        ],
      },
    });
    const mismatchedAttendance = await tx.raidAttendance.count({
      where: {
        OR: [
          { guildId, raid: { guildId: { not: guildId } } },
          { guildId: { not: guildId }, raid: { guildId } },
          { guildId: { not: guildId }, teamId: { in: targetTeams.map((team) => team.id) } },
        ],
      },
    });
    if (foreignRaids || mismatchedAttendance) throw new GuildRemovalIsolationError();

    // UserPreference <- RaidAttendance uses immediate ON DELETE RESTRICT. Delete
    // raids first so their attendance cascade completes before Guild cascades to
    // preferences. Do not infer this ordering from schema annotations alone.
    const raids = await tx.raid.deleteMany({ where: { guildId } });
    const guilds = await tx.guild.deleteMany({ where: { id: guildId, leftAt: null } });
    return { status: 'deleted', guilds: guilds.count, raids: raids.count };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (result.status === 'deleted' || result.status === 'absent') invalidateTierCache(guildId);
  return result;
}

interface GuildWork {
  generation: number;
  accepting: boolean;
  tail: Promise<unknown>;
}

/**
 * Single-process coordinator, matching the current bot deployment. Removal closes
 * admission synchronously, drains running work, skips queued work from the old
 * generation, deletes, and only then permits a queued rejoin to recreate defaults
 * through the existing lifecycle helper. Every guild writer MUST use run() before
 * this draft can be wired into runtime. It is not a distributed lock.
 */
export function createGuildRemovalDraft() {
  const work = new Map<string, GuildWork>();
  const removals = new WeakMap<GuildLifecyclePayload, Promise<GuildRemovalResult>>();

  function state(guildId: string): GuildWork {
    let entry = work.get(guildId);
    if (!entry) {
      entry = { generation: 0, accepting: false, tail: Promise.resolve() };
      work.set(guildId, entry);
    }
    return entry;
  }

  function enqueue<T>(entry: GuildWork, operation: () => Promise<T>): Promise<T> {
    const result = entry.tail.then(operation);
    entry.tail = result.catch(() => undefined);
    return result;
  }

  return {
    join(guild: GuildLifecyclePayload): Promise<void> {
      const entry = state(guild.id);
      const generation = ++entry.generation;
      entry.accepting = true;
      return enqueue(entry, async () => {
        if (generation !== entry.generation) return;
        try {
          await syncGuildOnJoin(guild);
        } catch (error) {
          if (generation === entry.generation) entry.accepting = false;
          throw error;
        }
      });
    },

    run<T>(guildId: string, operation: () => Promise<T>): Promise<T | undefined> {
      const entry = state(guildId);
      const generation = entry.generation;
      if (!entry.accepting) return Promise.resolve(undefined);
      return enqueue(entry, () => {
        if (!entry.accepting || generation !== entry.generation) return Promise.resolve(undefined);
        return operation();
      });
    },

    remove(guild: GuildLifecyclePayload): Promise<GuildRemovalResult> {
      // discord.js emits the cached Guild object. An accidental replay of that
      // object must not delete a later reinstallation of the same Discord ID.
      const previous = removals.get(guild);
      if (previous) return previous;
      const entry = state(guild.id);
      entry.accepting = false;
      ++entry.generation;
      const result = enqueue(entry, () => deleteConfirmedGuild(guild.id));
      removals.set(guild, result);
      return result;
    },
  };
}
