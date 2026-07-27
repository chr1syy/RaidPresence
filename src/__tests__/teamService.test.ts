jest.mock('../database/client');

import { Prisma } from '@prisma/client';
import prisma from '../database/client';
import {
  getDefaultTeam,
  listTeams,
  getTeamByName,
  createTeam,
  createTeamWithinLimit,
  deleteTeam,
  countTeams,
  DEFAULT_TEAM_NAME,
  DuplicateTeamNameError,
  DefaultTeamProtectedError,
  TeamLimitReachedError,
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
  // `clearAllMocks` keeps implementations, so the store/transaction stubs below would leak.
  (prisma.team.count as jest.Mock).mockReset();
  (prisma.$transaction as jest.Mock).mockReset();
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

  it('promotes an existing non-default "Main" instead of looping on the name conflict', async () => {
    const squatter = team({ id: 'team-main', isDefault: false, createdBy: 'user1' });
    (prisma.team.findFirst as jest.Mock)
      .mockResolvedValueOnce(null) // no default team
      .mockResolvedValueOnce(null) // ...still none after the conflict
      .mockResolvedValueOnce(squatter); // but the name is taken by a non-default team
    (prisma.team.create as jest.Mock).mockRejectedValue(uniqueConstraintError());
    (prisma.team.update as jest.Mock).mockResolvedValue({ ...squatter, isDefault: true });

    await expect(getDefaultTeam('guild1')).resolves.toMatchObject({
      id: 'team-main',
      isDefault: true,
    });
    expect(prisma.team.update as jest.Mock).toHaveBeenCalledWith({
      where: { id: 'team-main' },
      data: { isDefault: true },
    });
  });

  it('rethrows the P2002 error when neither a default team nor the name holder is found', async () => {
    (prisma.team.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.team.create as jest.Mock).mockRejectedValue(uniqueConstraintError());

    await expect(getDefaultTeam('guild1')).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
    expect(prisma.team.update as jest.Mock).not.toHaveBeenCalled();
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

describe('createTeamWithinLimit()', () => {
  /** The P2034 error Prisma raises when Postgres refuses to serialize a transaction. */
  function serializationError() {
    return new Prisma.PrismaClientKnownRequestError(
      'Transaction failed due to a write conflict or a deadlock',
      { code: 'P2034', clientVersion: '5.22.0' },
    );
  }

  /**
   * Installs a `$transaction` mock that emulates Postgres' Serializable isolation over an
   * in-memory team store: a transaction whose `count()` snapshot is stale by the time it
   * inserts is rejected with P2034, exactly as SSI would reject it. That is what makes the
   * FREE=1 invariant testable — without it a mocked transaction can never observe a race.
   */
  function installSerializableStore(rows: Array<Record<string, any>> = []) {
    const store = [...rows];
    let version = 0;
    let nextId = 1;

    (prisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: any) => Promise<unknown>, options?: { isolationLevel?: string }) => {
        // The invariant only holds under Serializable — assert the caller asked for it.
        expect(options?.isolationLevel).toBe('Serializable');

        let snapshot: number | null = null;
        const tx = {
          team: {
            count: async ({ where }: any) => {
              snapshot = version;
              return store.filter((row) => row.guildId === where.guildId).length;
            },
            create: async ({ data }: any) => {
              if (snapshot !== null && snapshot !== version) throw serializationError();
              if (store.some((row) => row.guildId === data.guildId && row.name === data.name)) {
                throw uniqueConstraintError();
              }
              const row = { id: `team-${nextId++}`, ...data };
              store.push(row);
              version++;
              return row;
            },
          },
        };

        return fn(tx);
      },
    );

    // The post-retry fallback count reads through the top-level client.
    (prisma.team.count as jest.Mock).mockImplementation(async ({ where }: any) =>
      store.filter((row) => row.guildId === where.guildId).length,
    );

    return store;
  }

  it('creates the team when the guild is below its limit', async () => {
    const store = installSerializableStore();

    const created = await createTeamWithinLimit('guild1', 'Mythic', 'user1', 1);

    expect(created).toMatchObject({ guildId: 'guild1', name: 'Mythic', isDefault: false });
    expect(store).toHaveLength(1);
  });

  it('refuses the insert when the limit is already reached', async () => {
    const store = installSerializableStore([team({ id: 'existing' })]);

    await expect(createTeamWithinLimit('guild1', 'Mythic', 'user1', 1)).rejects.toBeInstanceOf(
      TeamLimitReachedError,
    );
    expect(store).toHaveLength(1);
  });

  it('lets exactly one of two parallel FREE creates through — the limit is hard', async () => {
    const store = installSerializableStore();

    const results = await Promise.allSettled([
      createTeamWithinLimit('guild1', 'Alpha', 'user1', 1),
      createTeamWithinLimit('guild1', 'Bravo', 'user2', 1),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The loser must surface as the gateable limit error, never as a raw DB error.
    expect(rejected[0].reason).toBeInstanceOf(TeamLimitReachedError);
    // The invariant that matters: a FREE guild ends up with one team, not two.
    expect(store).toHaveLength(1);
  });

  it('lets both parallel creates through when the tier allows the second slot', async () => {
    const store = installSerializableStore();

    const results = await Promise.all([
      createTeamWithinLimit('guild1', 'Alpha', 'user1', 2),
      createTeamWithinLimit('guild1', 'Bravo', 'user2', 2),
    ]);

    expect(results.map((r) => r.name).sort()).toEqual(['Alpha', 'Bravo']);
    expect(store).toHaveLength(2);
  });

  it('counts other guilds separately', async () => {
    const store = installSerializableStore([team({ id: 'other', guildId: 'guild2' })]);

    await expect(createTeamWithinLimit('guild1', 'Mythic', 'user1', 1)).resolves.toMatchObject({
      guildId: 'guild1',
    });
    expect(store).toHaveLength(2);
  });

  it('skips the transaction entirely for unlimited (premium) guilds', async () => {
    const created = team({ id: 't2', name: 'Mythic', isDefault: false });
    (prisma.team.create as jest.Mock).mockResolvedValue(created);

    await expect(createTeamWithinLimit('guild1', 'Mythic', 'user1', null)).resolves.toBe(created);
    expect(prisma.$transaction as jest.Mock).not.toHaveBeenCalled();
  });

  it('maps a duplicate name to DuplicateTeamNameError', async () => {
    installSerializableStore([team({ id: 'existing', name: 'Mythic', isDefault: false })]);

    await expect(createTeamWithinLimit('guild1', 'Mythic', 'user1', 5)).rejects.toBeInstanceOf(
      DuplicateTeamNameError,
    );
  });

  it('retries a serialization failure and succeeds when a slot is still free', async () => {
    let calls = 0;
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      calls++;
      if (calls === 1) throw serializationError();
      return { id: 't2', guildId: 'guild1', name: 'Mythic' };
    });

    await expect(createTeamWithinLimit('guild1', 'Mythic', 'user1', 5)).resolves.toMatchObject({
      id: 't2',
    });
    expect(calls).toBe(2);
  });

  it('reports the limit when the retries are exhausted and the guild is full', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(serializationError());
    (prisma.team.count as jest.Mock).mockResolvedValue(1);

    await expect(createTeamWithinLimit('guild1', 'Mythic', 'user1', 1)).rejects.toBeInstanceOf(
      TeamLimitReachedError,
    );
  });

  it('rethrows an exhausted serialization failure when the guild is not full', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(serializationError());
    (prisma.team.count as jest.Mock).mockResolvedValue(0);

    await expect(createTeamWithinLimit('guild1', 'Mythic', 'user1', 5)).rejects.toMatchObject({
      code: 'P2034',
    });
  });

  it('treats a raw 40001 driver error as a serialization failure', async () => {
    let calls = 0;
    (prisma.$transaction as jest.Mock).mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        throw new Prisma.PrismaClientUnknownRequestError(
          'ERROR: could not serialize access due to read/write dependencies (SQLSTATE 40001)',
          { clientVersion: '5.22.0' },
        );
      }
      return { id: 't2', guildId: 'guild1', name: 'Mythic' };
    });

    await expect(createTeamWithinLimit('guild1', 'Mythic', 'user1', 5)).resolves.toMatchObject({
      id: 't2',
    });
  });

  it('rethrows unrelated transaction errors untouched', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('db down'));

    await expect(createTeamWithinLimit('guild1', 'Mythic', 'user1', 1)).rejects.toThrow('db down');
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
