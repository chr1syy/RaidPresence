import { Prisma, type Team } from '@prisma/client';
import prisma from '../database/client';

export type { Team };

/** Name of the auto-created default team every guild gets. */
export const DEFAULT_TEAM_NAME = 'Main';

/** Creator marker for auto-created default teams (no real Discord user behind it). */
const SYSTEM_CREATOR = 'system';

/** Thrown when a team name is already taken within the guild. */
export class DuplicateTeamNameError extends Error {
  constructor(public readonly guildId: string, public readonly name: string) {
    super(`A team named "${name}" already exists in guild ${guildId}`);
    this.name = 'DuplicateTeamNameError';
  }
}

/** Thrown when an operation is attempted on the default team that is not allowed for it. */
export class DefaultTeamProtectedError extends Error {
  constructor(public readonly teamId: string) {
    super(`Team ${teamId} is the default team and cannot be deleted`);
    this.name = 'DefaultTeamProtectedError';
  }
}

/** Thrown when the referenced team does not exist. */
export class TeamNotFoundError extends Error {
  constructor(public readonly teamId: string) {
    super(`Team ${teamId} not found`);
    this.name = 'TeamNotFoundError';
  }
}

/**
 * Thrown when the guild already holds as many teams as its tier allows.
 *
 * Raised inside the serializable create transaction, so it is authoritative: at the
 * moment of the (failed) insert the guild really was at its limit. The command layer
 * translates it back into the regular premium upsell.
 */
export class TeamLimitReachedError extends Error {
  constructor(public readonly guildId: string, public readonly limit: number) {
    super(`Guild ${guildId} already has its maximum of ${limit} team(s)`);
    this.name = 'TeamLimitReachedError';
  }
}

/** True when the error is a Prisma unique-constraint violation (P2002). */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

/**
 * True when the error is Postgres refusing to serialize a transaction (SQLSTATE 40001,
 * surfaced by Prisma as P2034). Under `Serializable` this is the *expected* signal that
 * a concurrent writer touched the rows we counted — the transaction simply has to be
 * retried.
 */
function isSerializationFailure(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2034';
  }
  // Raw driver errors can slip through as unknown request errors carrying the SQLSTATE.
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return /40001|could not serialize/i.test(error.message);
  }
  return false;
}

/** How often a serialization failure is retried before we settle it with a plain count. */
const MAX_SERIALIZATION_RETRIES = 2;

/**
 * Returns the guild's default team, creating it lazily when the guild has none yet.
 *
 * Idempotent under concurrency: two parallel calls for a fresh guild both attempt the
 * create, the loser hits the `@@unique([guildId, name])` constraint (P2002) and re-reads
 * the row the winner just wrote, so no duplicates are produced.
 *
 * Also self-heals the one other way the P2002 can happen: a guild that owns a *non-default*
 * team literally named "Main" (e.g. someone created it manually before the default team was
 * provisioned) has no default team to re-read, and a plain retry would fail on the same
 * conflict forever. That row is promoted to default instead.
 */
export async function getDefaultTeam(guildId: string): Promise<Team> {
  const existing = await prisma.team.findFirst({
    where: { guildId, isDefault: true },
  });
  if (existing) return existing;

  try {
    return await prisma.team.create({
      data: {
        guildId,
        name: DEFAULT_TEAM_NAME,
        isDefault: true,
        createdBy: SYSTEM_CREATOR,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    // Lost the race — the concurrent caller already created it.
    const team = await prisma.team.findFirst({
      where: { guildId, isDefault: true },
    });
    if (team) return team;

    // No default team, yet the name is taken: an existing non-default "Main" blocks us.
    // Promote it rather than looping on a conflict we can never win.
    const nameHolder = await prisma.team.findFirst({
      where: { guildId, name: DEFAULT_TEAM_NAME },
    });
    if (!nameHolder) throw error;

    return prisma.team.update({
      where: { id: nameHolder.id },
      data: { isDefault: true },
    });
  }
}

/** Lists all teams of a guild, default team first, then alphabetically by name. */
export async function listTeams(guildId: string): Promise<Team[]> {
  return prisma.team.findMany({
    where: { guildId },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
}

/** Lookup of a team by its ID. Returns `null` when the team no longer exists. */
export async function getTeamById(teamId: string): Promise<Team | null> {
  return prisma.team.findUnique({ where: { id: teamId } });
}

/** Case-insensitive lookup of a team by name within a guild. */
export async function getTeamByName(guildId: string, name: string): Promise<Team | null> {
  return prisma.team.findFirst({
    where: {
      guildId,
      name: { equals: name, mode: 'insensitive' },
    },
  });
}

/**
 * Creates a non-default team.
 *
 * Pure data access — premium gating (team limits per tier) lives in the command layer.
 * Throws {@link DuplicateTeamNameError} when the name is already taken in that guild.
 */
export async function createTeam(
  guildId: string,
  name: string,
  createdBy: string,
): Promise<Team> {
  try {
    return await prisma.team.create({
      data: { guildId, name, isDefault: false, createdBy },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DuplicateTeamNameError(guildId, name);
    }
    throw error;
  }
}

/**
 * Creates a non-default team, enforcing the guild's team limit atomically.
 *
 * `maxTeams` is the total number of teams the guild may hold, or `null` for unlimited
 * (premium). The count and the insert run inside one `Serializable` transaction, so
 * Postgres' predicate locks turn the read-then-write TOCTOU window into a serialization
 * failure instead of an over-limit insert: of two concurrent `/team create` calls on a
 * FREE guild, exactly one commits and the other is retried, sees the winner's row and
 * throws {@link TeamLimitReachedError}.
 *
 * A partial unique index would be cheaper but cannot express this rule — the limit
 * depends on `Guild.premiumTier`, i.e. on another table, which a Postgres index
 * predicate may not reference (and a trigger reading it would need the same isolation
 * to be race-free anyway).
 *
 * Throws {@link DuplicateTeamNameError} when the name is already taken in that guild and
 * {@link TeamLimitReachedError} when the limit is (or has just become) exhausted.
 */
export async function createTeamWithinLimit(
  guildId: string,
  name: string,
  createdBy: string,
  maxTeams: number | null,
): Promise<Team> {
  // Unlimited tiers have no invariant to protect, so they skip the transaction entirely.
  if (maxTeams === null) return createTeam(guildId, name, createdBy);

  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const currentCount = await tx.team.count({ where: { guildId } });
          if (currentCount >= maxTeams) throw new TeamLimitReachedError(guildId, maxTeams);

          return tx.team.create({
            data: { guildId, name, isDefault: false, createdBy },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof TeamLimitReachedError) throw error;
      if (isUniqueConstraintError(error)) throw new DuplicateTeamNameError(guildId, name);

      if (isSerializationFailure(error) && attempt < MAX_SERIALIZATION_RETRIES) continue;

      if (isSerializationFailure(error)) {
        // Retries exhausted. A concurrent create having taken the last slot is by far the
        // likeliest cause, so check once more and report the limit rather than a DB error.
        if ((await countTeams(guildId)) >= maxTeams) {
          throw new TeamLimitReachedError(guildId, maxTeams);
        }
      }

      throw error;
    }
  }
}

/**
 * Deletes a team and — via the schema's cascade — its raids and attendance.
 *
 * The default team is protected: it is the fallback every guild needs, so deleting it
 * would orphan the guild's raid creation path.
 */
export async function deleteTeam(teamId: string): Promise<void> {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw new TeamNotFoundError(teamId);
  if (team.isDefault) throw new DefaultTeamProtectedError(teamId);

  await prisma.team.delete({ where: { id: teamId } });
}

/** Number of teams in a guild (including the default team). */
export async function countTeams(guildId: string): Promise<number> {
  return prisma.team.count({ where: { guildId } });
}
