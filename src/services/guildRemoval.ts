import { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';
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

/** Process-local capability captured when work/UI is issued, never on a late callback. */
export interface GuildJobToken {
  readonly guildId: string;
  readonly generation: number;
}

interface GuildWork {
  token: GuildJobToken;
  accepting: boolean;
  legacyProtected: boolean;
  pending: number;
  tail: Promise<unknown>;
}

/**
 * Single-process coordinator, matching the current bot deployment. Removal closes
 * admission synchronously, drains running work, skips queued work from the old
 * generation, deletes, and only then permits a queued rejoin to recreate defaults
 * through the existing lifecycle helper. Every guild writer MUST use run() before
 * this draft can be wired into runtime. It is not a distributed lock.
 */
export function createGuildRemovalDraft(options: { invalidateGuild?: (guildId: string) => void } = {}) {
  const work = new Map<string, GuildWork>();
  const removals = new WeakMap<GuildLifecyclePayload, Promise<GuildRemovalResult>>();
  const removalTokens = new WeakMap<GuildJobToken, Promise<GuildRemovalResult>>();
  const joins = new WeakMap<GuildLifecyclePayload, Promise<GuildJobToken | undefined>>();
  const context = new AsyncLocalStorage<{ token: GuildJobToken; active: boolean }>();

  function state(guildId: string): GuildWork {
    let entry = work.get(guildId);
    if (!entry) {
      entry = {
        token: Object.freeze({ guildId, generation: 0 }), accepting: false,
        legacyProtected: false, pending: 0, tail: Promise.resolve(),
      };
      work.set(guildId, entry);
    }
    return entry;
  }

  function enqueue<T>(entry: GuildWork, operation: () => Promise<T>): Promise<T> {
    ++entry.pending;
    const result = entry.tail.then(operation).finally(() => { --entry.pending; });
    entry.tail = result.catch(() => undefined);
    return result;
  }

  function advance(entry: GuildWork): GuildJobToken {
    entry.token = Object.freeze({ guildId: entry.token.guildId, generation: entry.token.generation + 1 });
    return entry.token;
  }

  function isCurrent(token: GuildJobToken): boolean {
    const entry = work.get(token.guildId);
    return Boolean(entry?.accepting && entry.token === token);
  }

  function runWithToken<T>(token: GuildJobToken, operation: () => Promise<T>): Promise<T | undefined> {
    const parent = context.getStore();
    if (parent) {
      // A detached continuation must not escape the lifetime of its awaited root.
      if (!parent.active || parent.token !== token) return Promise.reject(new Error('Guild job context expired or belongs to another generation'));
      return operation(); // Reentrant same-guild work must not queue behind itself.
    }
    const entry = work.get(token.guildId);
    if (!entry || !isCurrent(token)) return Promise.resolve(undefined);
    return enqueue(entry, async () => {
      if (!isCurrent(token)) return undefined;
      const running = { token, active: true };
      try {
        return await context.run(running, operation);
      } finally {
        running.active = false;
      }
    });
  }

  return {
    capture(guildId: string): GuildJobToken { return state(guildId).token; },
    isCurrent,
    runWithToken,

    /** Reject busy UI work immediately so showModal/reply keep their first-response semantics. */
    tryRunWithToken<T>(token: GuildJobToken, operation: () => Promise<T>): Promise<T | undefined> {
      if (!context.getStore() && work.get(token.guildId)?.pending) return Promise.resolve(undefined);
      return runWithToken(token, operation);
    },

    join(guild: GuildLifecyclePayload): Promise<GuildJobToken | undefined> {
      if (context.getStore()) return Promise.reject(new Error('Guild lifecycle cannot be nested inside a writer job'));
      const previous = joins.get(guild);
      if (previous) return previous;
      const entry = state(guild.id);
      const token = advance(entry);
      entry.accepting = true;
      const result = enqueue(entry, async () => {
        if (token !== entry.token) return undefined;
        try {
          const existing = await prisma.guild.findUnique({ where: { id: guild.id }, select: { leftAt: true } });
          // Returning legacy is an unresolved product decision. Do not erase its
          // departure mark and accidentally make old history purge-eligible.
          if (entry.legacyProtected || existing?.leftAt) {
            entry.legacyProtected = true;
            entry.accepting = false;
            return undefined;
          }
          await syncGuildOnJoin(guild);
          return token;
        } catch (error) {
          if (token === entry.token) entry.accepting = false;
          throw error;
        }
      });
      joins.set(guild, result);
      return result;
    },

    run<T>(guildId: string, operation: () => Promise<T>): Promise<T | undefined> {
      const parent = context.getStore();
      if (parent && parent.token.guildId !== guildId) return Promise.reject(new Error('Cross-guild nested job is not allowed'));
      return runWithToken(parent?.token ?? state(guildId).token, operation);
    },

    remove(guild: GuildLifecyclePayload, token: GuildJobToken): Promise<GuildRemovalResult> {
      if (context.getStore()) return Promise.reject(new Error('Guild lifecycle cannot be nested inside a writer job'));
      // discord.js emits the cached Guild object. An accidental replay of that
      // object must not delete a later reinstallation of the same Discord ID.
      const previous = removals.get(guild);
      if (previous) return previous;
      const entry = state(guild.id);
      const duplicate = removalTokens.get(token);
      if (duplicate && token.guildId === guild.id) return duplicate;
      if (token.guildId !== guild.id || token !== entry.token) return Promise.resolve({ status: 'stale_generation' });
      entry.accepting = false;
      const revoked = advance(entry);
      // Synchronous invalidation closes the UI immediately, and a second pass
      // after drain removes drafts an already-running job may have just issued.
      const result = (async () => {
        options.invalidateGuild?.(guild.id);
        const outcome = await enqueue(entry, async () => {
          options.invalidateGuild?.(guild.id);
          if (entry.legacyProtected) return { status: 'legacy_retained' } as const;
          return deleteConfirmedGuild(guild.id);
        });
        // No permanent Guild-ID tombstone: token identity also fences a later
        // installation if generation numbers restart after reclaiming this entry.
        if ((outcome.status === 'deleted' || outcome.status === 'absent') &&
            !entry.accepting && entry.token === revoked && entry.pending === 0) work.delete(guild.id);
        return outcome;
      })();
      removals.set(guild, result);
      removalTokens.set(token, result);
      return result;
    },
  };
}
