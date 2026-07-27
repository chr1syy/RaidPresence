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

/** True when the error is a Prisma unique-constraint violation (P2002). */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

/**
 * Returns the guild's default team, creating it lazily when the guild has none yet.
 *
 * Idempotent under concurrency: two parallel calls for a fresh guild both attempt the
 * create, the loser hits the `@@unique([guildId, name])` constraint (P2002) and re-reads
 * the row the winner just wrote, so no duplicates are produced.
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
    if (!team) throw error;
    return team;
  }
}

/** Lists all teams of a guild, default team first, then alphabetically by name. */
export async function listTeams(guildId: string): Promise<Team[]> {
  return prisma.team.findMany({
    where: { guildId },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
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
