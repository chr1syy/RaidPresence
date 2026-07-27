jest.mock('../database/client');

import { Prisma } from '@prisma/client';
import prisma from '../database/client';
import {
  getDefaultTeam,
  listTeams,
  getTeamByName,
  createTeam,
  deleteTeam,
  countTeams,
  DEFAULT_TEAM_NAME,
  DuplicateTeamNameError,
  DefaultTeamProtectedError,
  TeamNotFoundError,
} from '../services/teamService';

/** Minimal Team row shaped like the Prisma model. */
function team(overrides: Record<string, unknown> = {}) {
  return {
    id: 'team-1',
    guildId: 'guild1',
    name: DEFAULT_TEAM_NAME,
    isDefault: true,
    createdBy: 'system',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as any;
}

/** The P2002 error Prisma raises when `@@unique([guildId, name])` is violated. */
function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target: ['guildId', 'name'] },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // The shared mock ships a default findFirst result for the raid suites — each test
  // here sets its own expectation explicitly.
  (prisma.team.findFirst as jest.Mock).mockReset();
});

describe('getDefaultTeam()', () => {
  it('returns the existing default team without creating one', async () => {
    const existing = team({ id: 'team-existing' });
    (prisma.team.findFirst as jest.Mock).mockResolvedValue(existing);

    await expect(getDefaultTeam('guild1')).resolves.toBe(existing);
    expect(prisma.team.findFirst as jest.Mock).toHaveBeenCalledWith({
      where: { guildId: 'guild1', isDefault: true },
    });
    expect(prisma.team.create as jest.Mock).not.toHaveBeenCalled();
  });

  it('lazily creates the default team for a guild that has none', async () => {
    const created = team({ id: 'team-new' });
    (prisma.team.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.team.create as jest.Mock).mockResolvedValue(created);

    await expect(getDefaultTeam('guild1')).resolves.toBe(created);
    expect(prisma.team.create as jest.Mock).toHaveBeenCalledWith({
      data: {
        guildId: 'guild1',
        name: DEFAULT_TEAM_NAME,
        isDefault: true,
        createdBy: 'system',
      },
    });
  });

  it('is idempotent under a P2002 race: re-reads the row the winner wrote', async () => {
    const winner = team({ id: 'team-winner' });
    (prisma.team.findFirst as jest.Mock)
      .mockResolvedValueOnce(null) // initial lookup — nothing there yet
      .mockResolvedValueOnce(winner); // re-read after losing the race
    (prisma.team.create as jest.Mock).mockRejectedValue(uniqueConstraintError());

    await expect(getDefaultTeam('guild1')).resolves.toBe(winner);
    expect(prisma.team.create as jest.Mock).toHaveBeenCalledTimes(1);
    expect(prisma.team.findFirst as jest.Mock).toHaveBeenCalledTimes(2);
  });

  it('rethrows non-P2002 create errors', async () => {
    (prisma.team.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.team.create as jest.Mock).mockRejectedValue(new Error('db down'));

    await expect(getDefaultTeam('guild1')).rejects.toThrow('db down');
  });

  it('rethrows the P2002 error when the re-read still finds nothing', async () => {
    (prisma.team.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.team.create as jest.Mock).mockRejectedValue(uniqueConstraintError());

    await expect(getDefaultTeam('guild1')).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
  });
});

describe('listTeams()', () => {
  it('orders the default team first, then alphabetically', async () => {
    const rows = [
      team({ id: 't1', name: 'Main', isDefault: true }),
      team({ id: 't2', name: 'Alts', isDefault: false }),
      team({ id: 't3', name: 'Mythic', isDefault: false }),
    ];
    (prisma.team.findMany as jest.Mock).mockResolvedValue(rows);

    await expect(listTeams('guild1')).resolves.toBe(rows);
    expect(prisma.team.findMany as jest.Mock).toHaveBeenCalledWith({
      where: { guildId: 'guild1' },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  });
});

describe('getTeamByName()', () => {
  it('looks up case-insensitively', async () => {
    const found = team({ id: 't2', name: 'Mythic', isDefault: false });
    (prisma.team.findFirst as jest.Mock).mockResolvedValue(found);

    await expect(getTeamByName('guild1', 'mYtHiC')).resolves.toBe(found);
    expect(prisma.team.findFirst as jest.Mock).toHaveBeenCalledWith({
      where: {
        guildId: 'guild1',
        name: { equals: 'mYtHiC', mode: 'insensitive' },
      },
    });
  });

  it('returns null when no team matches', async () => {
    (prisma.team.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(getTeamByName('guild1', 'nope')).resolves.toBeNull();
  });
});

describe('createTeam()', () => {
  it('creates a non-default team without premium gating', async () => {
    const created = team({ id: 't2', name: 'Mythic', isDefault: false, createdBy: 'user1' });
    (prisma.team.create as jest.Mock).mockResolvedValue(created);

    await expect(createTeam('guild1', 'Mythic', 'user1')).resolves.toBe(created);
    expect(prisma.team.create as jest.Mock).toHaveBeenCalledWith({
      data: { guildId: 'guild1', name: 'Mythic', isDefault: false, createdBy: 'user1' },
    });
    // Gating belongs to the command layer (Phase 4) — the service must not read tiers.
    expect(prisma.guild.findUnique as jest.Mock).not.toHaveBeenCalled();
  });

  it('throws DuplicateTeamNameError on a duplicate name', async () => {
    (prisma.team.create as jest.Mock).mockRejectedValue(uniqueConstraintError());

    await expect(createTeam('guild1', 'Mythic', 'user1')).rejects.toBeInstanceOf(
      DuplicateTeamNameError,
    );
  });

  it('rethrows unrelated create errors untouched', async () => {
    (prisma.team.create as jest.Mock).mockRejectedValue(new Error('db down'));

    await expect(createTeam('guild1', 'Mythic', 'user1')).rejects.toThrow('db down');
  });
});

describe('deleteTeam()', () => {
  it('deletes a non-default team', async () => {
    (prisma.team.findUnique as jest.Mock).mockResolvedValue(
      team({ id: 't2', name: 'Mythic', isDefault: false }),
    );
    (prisma.team.delete as jest.Mock).mockResolvedValue({} as any);

    await expect(deleteTeam('t2')).resolves.toBeUndefined();
    expect(prisma.team.delete as jest.Mock).toHaveBeenCalledWith({ where: { id: 't2' } });
  });

  it('refuses to delete the default team', async () => {
    (prisma.team.findUnique as jest.Mock).mockResolvedValue(team({ id: 't1', isDefault: true }));

    await expect(deleteTeam('t1')).rejects.toBeInstanceOf(DefaultTeamProtectedError);
    expect(prisma.team.delete as jest.Mock).not.toHaveBeenCalled();
  });

  it('throws TeamNotFoundError for an unknown team', async () => {
    (prisma.team.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(deleteTeam('ghost')).rejects.toBeInstanceOf(TeamNotFoundError);
    expect(prisma.team.delete as jest.Mock).not.toHaveBeenCalled();
  });
});

describe('countTeams()', () => {
  it('returns the number of teams in the guild', async () => {
    (prisma.team.count as jest.Mock).mockResolvedValue(3);

    await expect(countTeams('guild1')).resolves.toBe(3);
    expect(prisma.team.count as jest.Mock).toHaveBeenCalledWith({
      where: { guildId: 'guild1' },
    });
  });

  it('returns 0 for a guild without teams', async () => {
    (prisma.team.count as jest.Mock).mockResolvedValue(0);
    await expect(countTeams('empty')).resolves.toBe(0);
  });
});
