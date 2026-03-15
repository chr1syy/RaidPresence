import { resolveUserRoleId, getEffectivePrefsMap } from '../rolePreference';

jest.mock('../../database/client');
import prisma from '../../database/client';

const mockPrisma = prisma as any;

describe('resolveUserRoleId', () => {
  it('returns the first raid role the user has', () => {
    expect(resolveUserRoleId(['a', 'b', 'c'], ['x', 'b', 'c'])).toBe('b');
  });

  it('returns null when no roles match', () => {
    expect(resolveUserRoleId(['a', 'b'], ['x', 'y'])).toBeNull();
  });

  it('returns null for empty arrays', () => {
    expect(resolveUserRoleId([], ['x'])).toBeNull();
    expect(resolveUserRoleId(['a'], [])).toBeNull();
  });

  it('returns the first raid role in raid order, not user order', () => {
    expect(resolveUserRoleId(['c', 'a'], ['a', 'c'])).toBe('a');
  });
});

describe('getEffectivePrefsMap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty map for empty userIds', async () => {
    const result = await getEffectivePrefsMap([], 'guild1', ['role1'], new Map());
    expect(result.size).toBe(0);
  });

  it('uses role-specific preference when available', async () => {
    mockPrisma.userRolePreference.findMany.mockResolvedValue([
      { userId: 'u1', roleId: 'r1', wowClass: 'Warrior', wowSpec: 'Protection' },
    ]);
    mockPrisma.userPreference.findMany.mockResolvedValue([
      { userId: 'u1', wowClass: 'Mage', wowSpec: 'Fire' },
    ]);

    const memberRoles = new Map([['u1', ['r1', 'r2']]]);
    const result = await getEffectivePrefsMap(['u1'], 'g1', ['r1'], memberRoles);

    expect(result.get('u1')).toEqual({ wowClass: 'Warrior', wowSpec: 'Protection' });
  });

  it('falls back to global preference when no role match', async () => {
    mockPrisma.userRolePreference.findMany.mockResolvedValue([]);
    mockPrisma.userPreference.findMany.mockResolvedValue([
      { userId: 'u1', wowClass: 'Mage', wowSpec: 'Fire' },
    ]);

    const memberRoles = new Map([['u1', ['other']]]);
    const result = await getEffectivePrefsMap(['u1'], 'g1', ['r1'], memberRoles);

    expect(result.get('u1')).toEqual({ wowClass: 'Mage', wowSpec: 'Fire' });
  });

  it('falls back to global when role matches but no role preference exists', async () => {
    mockPrisma.userRolePreference.findMany.mockResolvedValue([]);
    mockPrisma.userPreference.findMany.mockResolvedValue([
      { userId: 'u1', wowClass: 'Druid', wowSpec: 'Restoration' },
    ]);

    const memberRoles = new Map([['u1', ['r1']]]);
    const result = await getEffectivePrefsMap(['u1'], 'g1', ['r1'], memberRoles);

    expect(result.get('u1')).toEqual({ wowClass: 'Druid', wowSpec: 'Restoration' });
  });

  it('returns null class/spec when no preferences exist at all', async () => {
    mockPrisma.userRolePreference.findMany.mockResolvedValue([]);
    mockPrisma.userPreference.findMany.mockResolvedValue([]);

    const memberRoles = new Map([['u1', ['r1']]]);
    const result = await getEffectivePrefsMap(['u1'], 'g1', ['r1'], memberRoles);

    expect(result.get('u1')).toEqual({ wowClass: null, wowSpec: null });
  });

  it('handles multiple users with mixed preferences', async () => {
    mockPrisma.userRolePreference.findMany.mockResolvedValue([
      { userId: 'u1', roleId: 'r1', wowClass: 'Warrior', wowSpec: 'Arms' },
    ]);
    mockPrisma.userPreference.findMany.mockResolvedValue([
      { userId: 'u2', wowClass: 'Priest', wowSpec: 'Holy' },
    ]);

    const memberRoles = new Map([
      ['u1', ['r1']],
      ['u2', ['other']],
    ]);
    const result = await getEffectivePrefsMap(['u1', 'u2'], 'g1', ['r1'], memberRoles);

    expect(result.get('u1')).toEqual({ wowClass: 'Warrior', wowSpec: 'Arms' });
    expect(result.get('u2')).toEqual({ wowClass: 'Priest', wowSpec: 'Holy' });
  });

  it('skips role preference query when no users match any raid role', async () => {
    mockPrisma.userPreference.findMany.mockResolvedValue([]);

    const memberRoles = new Map([['u1', ['unrelated']]]);
    await getEffectivePrefsMap(['u1'], 'g1', ['r1'], memberRoles);

    expect(mockPrisma.userRolePreference.findMany).not.toHaveBeenCalled();
  });
});
