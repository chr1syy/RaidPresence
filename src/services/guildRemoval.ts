import { Prisma } from '@prisma/client';
import { createGuildJobCoordinator, GuildJobToken } from './guildJobs';
export type { GuildJobToken } from './guildJobs';
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
  | { status: 'absent' | 'legacy_retained' | 'stale_generation' };

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

/** Inactive deletion policy composed with the same non-destructive job primitive as runtime. */
export function createGuildRemovalDraft(options: { invalidateGuild?: (guildId: string) => void } = {}) {
  const jobs = createGuildJobCoordinator(options);
  const legacy = new Set<string>();
  const joins = new WeakMap<GuildLifecyclePayload, Promise<GuildJobToken | undefined>>();
  const removals = new WeakMap<GuildLifecyclePayload, Promise<GuildRemovalResult>>();
  const removalTokens = new WeakMap<GuildJobToken, Promise<GuildRemovalResult>>();
  return {
    capture: jobs.capture, isCurrent: jobs.isCurrent,
    runWithToken: jobs.runWithToken, tryRunWithToken: jobs.tryRunWithToken, run: jobs.run,
    join(guild: GuildLifecyclePayload): Promise<GuildJobToken | undefined> {
      if (jobs.current()) return Promise.reject(new Error('Guild lifecycle cannot be nested inside a writer job'));
      const previous = joins.get(guild); if (previous) return previous;
      const result = jobs.observe(guild.id, async () => {
        const existing = await prisma.guild.findUnique({ where: { id: guild.id }, select: { leftAt: true } });
        if (legacy.has(guild.id) || existing?.leftAt) { legacy.add(guild.id); return false; }
        await syncGuildOnJoin(guild);
      });
      joins.set(guild, result); return result;
    },
    remove(guild: GuildLifecyclePayload, token: GuildJobToken): Promise<GuildRemovalResult> {
      if (jobs.current()) return Promise.reject(new Error('Guild lifecycle cannot be nested inside a writer job'));
      const previous = removals.get(guild); if (previous) return previous;
      const duplicate = removalTokens.get(token);
      if (duplicate && token.guildId === guild.id) return duplicate;
      if (token.guildId !== guild.id || !jobs.owns(token)) return Promise.resolve({ status: 'stale_generation' });
      const result = (async (): Promise<GuildRemovalResult> => {
        const outcome = await jobs.depart(token, async (): Promise<GuildRemovalResult> =>
          legacy.has(guild.id) ? { status: 'legacy_retained' } : deleteConfirmedGuild(guild.id));
        if (outcome?.status === 'deleted' || outcome?.status === 'absent') jobs.forget(guild.id);
        return outcome ?? { status: 'stale_generation' };
      })();
      removals.set(guild, result); removalTokens.set(token, result); return result;
    },
  };
}
