/**
 * Regression test suite for `/raid` visibility & authorization gating (RPONB-03).
 *
 * Unlike the other `/raid` suites, `../../utils/permissions` is deliberately NOT mocked
 * here: the whole point is to exercise the real `canManageRaids()` against a mocked
 * Prisma, because that function is the *only* thing standing between a member and a
 * mutating subcommand now that `.setDefaultMemberPermissions(ManageEvents)` is gone.
 *
 * Covers:
 * 1. The command definition carries no `default_member_permissions` (so Discord shows
 *    `/raid` to every member and database-configured leader roles actually work).
 * 2. Database-configured leader roles grant access without ManageEvents/Administrator.
 * 3. Members without any of those are still rejected and cause no writes.
 * 4. Administrators and the ManageEvents fallback keep working.
 * 5. Read-only `/raid list` stays open while `/raid search` stays gated.
 */

import { PermissionFlagsBits } from 'discord.js';

// Mock dependencies before imports that use them. `../../utils/permissions` stays REAL.
jest.mock('../../database/client');
jest.mock('../../middleware/premiumGate', () => ({
  gateFeature: jest.fn().mockResolvedValue(true),
  premiumFooterHint: jest.fn().mockReturnValue('-# hint'),
  freeTierHint: jest.fn().mockResolvedValue(''),
}));
jest.mock('../../services/entitlementService', () => ({
  getTier: jest.fn().mockResolvedValue('PREMIUM'),
  hasFeature: jest.fn().mockReturnValue(true),
  tryConsumeWeeklyRaid: jest.fn().mockResolvedValue({ allowed: true, remaining: 4 }),
  skuToTier: jest.fn(),
  FEATURE_TIERS: {},
}));

import prisma from '../../database/client';
import { canManageRaids } from '../../utils/permissions';
import command from '../raid';

/** Minimal Collection-like Map supporting the discord.js helpers the code uses. */
class MockCollection<K, V> extends Map<K, V> {
  some(fn: (value: V, key: K, map: this) => boolean): boolean {
    for (const [key, value] of this) {
      if (fn(value, key, this)) return true;
    }
    return false;
  }

  filter(fn: (value: V, key: K, map: this) => boolean): MockCollection<K, V> {
    const result = new MockCollection<K, V>();
    for (const [key, value] of this) {
      if (fn(value, key, this)) result.set(key, value);
    }
    return result;
  }

  find(fn: (value: V, key: K, map: this) => boolean): V | undefined {
    for (const [key, value] of this) {
      if (fn(value, key, this)) return value;
    }
    return undefined;
  }
}

/** Discord-like permission bitfield stub: `has()` is true only for the granted flags. */
function makePermissions(granted: bigint[]) {
  return {
    has: (flag: bigint | bigint[]) =>
      (Array.isArray(flag) ? flag : [flag]).every((f) => granted.includes(f)),
  };
}

function futureDateStr(daysFromNow = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

const GUILD_ID = 'guild-123';

/** Guild row as stored after `/config leader-roles Officer`. */
function guildRow(overrides: Record<string, any> = {}) {
  return {
    id: GUILD_ID,
    name: 'Test Guild',
    raidRoles: 'Raider',
    raidLeaderRoles: 'Officer',
    language: 'en',
    timezone: 'UTC',
    ...overrides,
  };
}

describe('/raid visibility & authorization gating', () => {
  let mockGuild: any;
  let mockChannel: any;

  /**
   * Builds a member whose role cache holds `roleNames` and whose permission bitfield
   * grants exactly `permissions` — i.e. the raw material `canManageRaids()` reads.
   */
  function makeMember(roleNames: string[], permissions: bigint[] = []) {
    const rolesCache = new MockCollection<string, any>();
    for (const name of roleNames) {
      rolesCache.set(`role-${name}`, { id: `role-${name}`, name });
    }
    return {
      user: { bot: false, id: 'user-123' },
      id: 'user-123',
      displayName: 'TestUser',
      guild: { id: GUILD_ID },
      roles: { cache: rolesCache },
      permissions: makePermissions(permissions),
    };
  }

  function buildInteraction(
    subcommand: string,
    member: any,
    optionValues: Record<string, any> = {}
  ): any {
    return {
      guild: mockGuild,
      guildId: GUILD_ID,
      channel: mockChannel,
      member,
      user: { id: 'user-123' },
      isChatInputCommand: jest.fn().mockReturnValue(true),
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
      client: { channels: { fetch: jest.fn().mockResolvedValue(mockChannel) } },
      options: {
        getSubcommand: jest.fn().mockReturnValue(subcommand),
        get: jest.fn((key: string, required?: boolean) => {
          if (optionValues[key] !== undefined) return { value: optionValues[key] };
          return required ? { value: null } : undefined;
        }),
      },
    };
  }

  /** `/raid create` options that pass validation, so only permissions decide the outcome. */
  const createOptions = {
    date: futureDateStr(),
    time: '20:00',
    title: 'Weekly Raid',
    roles: 'Raider',
    ping_roles: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const rolesCache = new MockCollection<string, any>();
    rolesCache.set('role-Raider', { id: 'role-Raider', name: 'Raider' });

    const membersCache = new MockCollection<string, any>();
    membersCache.set('user-200', {
      user: { bot: false, id: 'user-200' },
      roles: { cache: rolesCache },
      displayName: 'TankPlayer',
    });

    mockGuild = {
      id: GUILD_ID,
      name: 'Test Guild',
      members: { cache: membersCache, fetch: jest.fn().mockResolvedValue(undefined) },
      roles: { cache: rolesCache },
    };

    mockChannel = {
      id: 'channel-123',
      isTextBased: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue({ id: 'message-123' }),
    };

    // One guild row serves both `canManageRaids()` and the command handlers.
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(guildRow());
    (prisma.team.findFirst as jest.Mock).mockResolvedValue({
      id: 'team-default',
      guildId: GUILD_ID,
      name: 'Main',
      isDefault: true,
      createdBy: 'system',
    });
    (prisma.team.count as jest.Mock).mockResolvedValue(1);
    (prisma.userPreference.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.userPreference.upsert as jest.Mock).mockResolvedValue({});
    (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.raid.create as jest.Mock).mockResolvedValue({
      id: 'raid-new-1',
      guildId: GUILD_ID,
      channelId: 'channel-123',
      raidDate: new Date(),
      description: 'Weekly Raid',
      roles: 'Raider',
      createdBy: 'user-123',
    });
    (prisma.raidAttendance.createMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.raid.update as jest.Mock).mockResolvedValue({});
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue({
      id: 'raid-new-1',
      guildId: GUILD_ID,
      channelId: 'channel-123',
      raidDate: new Date(),
      description: 'Weekly Raid',
      status: 'open',
      guild: { language: 'en' },
      attendance: [],
    });
    (prisma.raid.delete as jest.Mock).mockResolvedValue({});
  });

  describe('command definition', () => {
    it('must not set default_member_permissions (keeps /raid visible to everyone)', () => {
      const json = command.data.toJSON() as Record<string, any>;
      // A non-null value here would hide `/raid` from exactly the members an admin
      // just granted access to via `/config leader-roles` — the RPONB-03 regression.
      expect(json.default_member_permissions ?? null).toBeNull();
    });
  });

  describe('canManageRaids() against database-configured leader roles', () => {
    it('grants a member holding a configured leader role, without ManageEvents/Admin', async () => {
      const member = makeMember(['Officer']);
      await expect(canManageRaids(member as any)).resolves.toBe(true);
    });

    it('grants a member whose leader role matches by ID rather than name', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue(
        guildRow({ raidLeaderRoles: 'role-Officer' })
      );
      const member = makeMember(['Officer']);
      await expect(canManageRaids(member as any)).resolves.toBe(true);
    });

    it('grants an administrator that holds no leader role', async () => {
      const member = makeMember(['Member'], [PermissionFlagsBits.Administrator]);
      await expect(canManageRaids(member as any)).resolves.toBe(true);
    });

    it('rejects a member with neither leader role, ManageEvents nor Administrator', async () => {
      const member = makeMember(['Member']);
      await expect(canManageRaids(member as any)).resolves.toBe(false);
    });

    it('rejects ManageEvents alone once leader roles are configured', async () => {
      const member = makeMember(['Member'], [PermissionFlagsBits.ManageEvents]);
      await expect(canManageRaids(member as any)).resolves.toBe(false);
    });

    describe('fallback when no leader roles are configured', () => {
      beforeEach(() => {
        (prisma.guild.findUnique as jest.Mock).mockResolvedValue(
          guildRow({ raidLeaderRoles: '' })
        );
      });

      it('falls back to ManageEvents', async () => {
        const member = makeMember(['Member'], [PermissionFlagsBits.ManageEvents]);
        await expect(canManageRaids(member as any)).resolves.toBe(true);
      });

      it('still grants administrators', async () => {
        const member = makeMember(['Member'], [PermissionFlagsBits.Administrator]);
        await expect(canManageRaids(member as any)).resolves.toBe(true);
      });

      it('rejects members with neither', async () => {
        const member = makeMember(['Member']);
        await expect(canManageRaids(member as any)).resolves.toBe(false);
      });
    });
  });

  describe('/raid create', () => {
    it('lets a leader-role member through to raid creation', async () => {
      const interaction = buildInteraction('create', makeMember(['Officer']), createOptions);

      await command.execute(interaction);

      expect(prisma.raid.create).toHaveBeenCalled();
      const replies = (interaction.editReply as jest.Mock).mock.calls.map(
        (call) => call[0]?.content ?? ''
      );
      expect(replies.join('\n')).not.toContain('do not have permission');
    });

    it('rejects a member without leader role or permissions, creating nothing', async () => {
      const interaction = buildInteraction('create', makeMember(['Member']), createOptions);

      await command.execute(interaction);

      // Rejected via `reply`, not `editReply`: the permission gate now runs before
      // deferReply() so the guided-modal branch can call showModal() first (#38).
      // Rejections stay ephemeral so they never leak into the raid channel — now
      // asserted on the reply itself, since there is no deferral on this path.
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('do not have permission'),
          ephemeral: true,
        })
      );
      expect(prisma.raid.create).not.toHaveBeenCalled();
    });

    it('rejects a member holding only ManageEvents once leader roles are configured', async () => {
      const interaction = buildInteraction(
        'create',
        makeMember(['Member'], [PermissionFlagsBits.ManageEvents]),
        createOptions
      );

      await command.execute(interaction);

      expect(prisma.raid.create).not.toHaveBeenCalled();
    });
  });

  describe('/raid delete', () => {
    it('rejects a member without leader role or permissions, deleting nothing', async () => {
      const interaction = buildInteraction('delete', makeMember(['Member']), {
        raid_id: 'raid-123',
      });

      await command.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('do not have permission') })
      );
      expect(prisma.raid.delete).not.toHaveBeenCalled();
      expect(interaction.deferReply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true })
      );
    });

    it('lets a leader-role member reach the raid lookup', async () => {
      const interaction = buildInteraction('delete', makeMember(['Officer']), {
        raid_id: 'raid-new-1',
      });

      await command.execute(interaction);

      expect(prisma.raid.delete).toHaveBeenCalledWith({ where: { id: 'raid-new-1' } });
    });
  });

  describe('open vs. gated read-only subcommands (RPONB-03 decision)', () => {
    it('/raid list stays open to a member without any raid permissions', async () => {
      const interaction = buildInteraction('list', makeMember(['Member']));

      await command.execute(interaction);

      expect(prisma.raid.findMany).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('No upcoming raids') })
      );
    });

    it('/raid search stays gated for that same member', async () => {
      const interaction = buildInteraction('search', makeMember(['Member']), {
        query: 'naxx',
      });

      await command.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('do not have permission') })
      );
      expect(prisma.raid.findMany).not.toHaveBeenCalled();
    });
  });
});
