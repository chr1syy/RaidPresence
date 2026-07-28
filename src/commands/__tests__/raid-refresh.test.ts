/**
 * Regression test suite for handleRefreshRaid() function
 * Tests: permission checks, raid lookup, guild isolation,
 * member roster comparison (add/remove deltas), embed update.
 */

import { canManageRaids } from '../../utils/permissions';

jest.mock('../../database/client');
jest.mock('../../utils/permissions');

import prisma from '../../database/client';
import command from '../raid';

/**
 * Minimal Collection-like Map that supports discord.js `.some()`.
 */
class MockCollection<K, V> extends Map<K, V> {
  some(fn: (value: V, key: K, map: this) => boolean): boolean {
    for (const [key, value] of this) {
      if (fn(value, key, this)) return true;
    }
    return false;
  }

  find(fn: (value: V, key: K, map: this) => boolean): V | undefined {
    for (const [key, value] of this) {
      if (fn(value, key, this)) return value;
    }
    return undefined;
  }

  filter(fn: (value: V, key: K, map: this) => boolean): MockCollection<K, V> {
    const result = new MockCollection<K, V>();
    for (const [key, value] of this) {
      if (fn(value, key, this)) result.set(key, value);
    }
    return result;
  }

  map<T>(fn: (value: V, key: K, map: this) => T): T[] {
    const result: T[] = [];
    for (const [key, value] of this) {
      result.push(fn(value, key, this));
    }
    return result;
  }
}

function makeRoleCache(...roleNames: string[]): MockCollection<string, any> {
  const cache = new MockCollection<string, any>();
  roleNames.forEach((name) => {
    cache.set(name, { id: name, name });
  });
  return cache;
}

function makeMember(id: string, name: string, roles: string[], bot = false) {
  return {
    user: { bot, id },
    roles: { cache: makeRoleCache(...roles) },
    displayName: name,
  };
}

describe('handleRefreshRaid()', () => {
  let mockInteraction: any;
  let mockChannel: any;
  let mockMessage: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMessage = {
      edit: jest.fn().mockResolvedValue(undefined),
    };

    mockChannel = {
      id: 'channel-123',
      isTextBased: jest.fn().mockReturnValue(true),
      messages: {
        fetch: jest.fn().mockResolvedValue(mockMessage),
      },
    };

    const membersCache = new MockCollection<string, any>();
    membersCache.set('user-1', makeMember('user-1', 'Player1', ['Raider']));
    membersCache.set('user-2', makeMember('user-2', 'Player2', ['Raider']));
    membersCache.set('user-3', makeMember('user-3', 'NewPlayer', ['Raider']));

    mockInteraction = {
      guild: {
        id: 'guild-123',
        name: 'Test Guild',
        members: {
          cache: membersCache,
          fetch: jest.fn().mockResolvedValue(undefined),
        },
        roles: { cache: makeRoleCache('Raider') },
      },
      channel: { id: 'channel-123' },
      member: { user: { id: 'user-123' } },
      isChatInputCommand: jest.fn().mockReturnValue(true),
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
      client: {
        channels: { fetch: jest.fn().mockResolvedValue(mockChannel) },
      },
      options: {
        getSubcommand: jest.fn().mockReturnValue('refresh'),
        get: jest.fn((key: string) => {
          if (key === 'raid_id') return { value: 'raid-123' };
          return undefined;
        }),
      },
    };

    (canManageRaids as jest.Mock).mockResolvedValue(true);
  });

  it('should reject when not in a guild', async () => {
    mockInteraction.guild = null;
    await command.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('server'), ephemeral: true })
    );
  });

  it('should reject users without permission', async () => {
    (canManageRaids as jest.Mock).mockResolvedValue(false);
    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('permission') })
    );
  });

  it('should reject when raid not found', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(null);
    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('not found') })
    );
  });

  it('should reject when raid belongs to different guild', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue({
      id: 'raid-123',
      guildId: 'other-guild',
      roles: 'Raider',
      guild: { raidRoles: 'Raider', language: 'en' },
      attendance: [],
    });
    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('does not belong') })
    );
  });

  it('should add new eligible members and remove ineligible ones', async () => {
    // Raid currently has user-1 and user-removed (who lost role)
    (prisma.raid.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: 'raid-123',
        guildId: 'guild-123',
        roles: 'Raider',
        status: 'open',
        messageId: 'msg-123',
        channelId: 'channel-123',
        raidDate: new Date(),
        description: 'Weekly Raid',
        guild: { raidRoles: 'Raider', language: 'en' },
        attendance: [
          { id: 'att-1', userId: 'user-1', guildId: 'guild-123', status: 'attending' },
          { id: 'att-removed', userId: 'user-removed', guildId: 'guild-123', status: 'attending' },
        ],
      })
      // Second call is for createRaidEmbed
      .mockResolvedValueOnce({
        id: 'raid-123',
        guildId: 'guild-123',
        raidDate: new Date(),
        description: 'Weekly Raid',
        status: 'open',
        guild: { language: 'en' },
        attendance: [],
      });

    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      id: 'guild-123',
      raidRoles: 'Raider',
      language: 'en',
    });

    (prisma.userPreference.upsert as jest.Mock).mockResolvedValue({});
    (prisma.userPreference.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.raidAttendance.createMany as jest.Mock).mockResolvedValue({ count: 2 });
    (prisma.raidAttendance.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    await command.execute(mockInteraction);

    // Should add user-2 and user-3 (not yet in attendance)
    expect(prisma.raidAttendance.createMany).toHaveBeenCalled();

    // Should remove user-removed (no longer eligible)
    expect(prisma.raidAttendance.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          raidId: 'raid-123',
          userId: { in: ['user-removed'] },
        },
      })
    );

    // Should report changes
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Added 2 new member(s)'),
      })
    );
  });

  it('should report no changes when roster is up to date', async () => {
    // All current members are already in attendance, no extras
    (prisma.raid.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: 'raid-123',
        guildId: 'guild-123',
        roles: 'Raider',
        status: 'open',
        messageId: 'msg-123',
        channelId: 'channel-123',
        raidDate: new Date(),
        description: 'Weekly Raid',
        guild: { raidRoles: 'Raider', language: 'en' },
        attendance: [
          { id: 'att-1', userId: 'user-1', guildId: 'guild-123', status: 'attending' },
          { id: 'att-2', userId: 'user-2', guildId: 'guild-123', status: 'attending' },
          { id: 'att-3', userId: 'user-3', guildId: 'guild-123', status: 'attending' },
        ],
      })
      .mockResolvedValueOnce({
        id: 'raid-123',
        guildId: 'guild-123',
        raidDate: new Date(),
        description: 'Weekly Raid',
        status: 'open',
        guild: { language: 'en' },
        attendance: [],
      });

    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      id: 'guild-123',
      raidRoles: 'Raider',
      language: 'en',
    });

    (prisma.userPreference.findMany as jest.Mock).mockResolvedValue([]);

    await command.execute(mockInteraction);

    // No new members to add
    expect(prisma.raidAttendance.createMany).not.toHaveBeenCalled();
    // No members to remove
    expect(prisma.raidAttendance.deleteMany).not.toHaveBeenCalled();

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('No roster changes'),
      })
    );
  });

  it('should name the raid team on multi-team guilds', async () => {
    // Drop any `mockResolvedValueOnce` queue left over from the previous test —
    // `clearAllMocks()` clears recorded calls but not queued one-shot results.
    (prisma.raid.findUnique as jest.Mock).mockReset();
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue({
      id: 'raid-123',
      guildId: 'guild-123',
      teamId: 'team-alts',
      roles: 'Raider',
      status: 'open',
      messageId: 'msg-123',
      channelId: 'channel-123',
      raidDate: new Date(),
      description: 'Weekly Raid',
      guild: { raidRoles: 'Raider', language: 'en' },
      attendance: [
        { id: 'att-1', userId: 'user-1', guildId: 'guild-123', status: 'attending' },
        { id: 'att-2', userId: 'user-2', guildId: 'guild-123', status: 'attending' },
        { id: 'att-3', userId: 'user-3', guildId: 'guild-123', status: 'attending' },
      ],
    });

    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      id: 'guild-123',
      raidRoles: 'Raider',
      language: 'en',
    });
    (prisma.userPreference.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.team.count as jest.Mock).mockResolvedValue(2);
    (prisma.team.findUnique as jest.Mock).mockResolvedValue({ id: 'team-alts', name: 'Alts' });

    await command.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '✅ No roster changes needed. (Team: **Alts**)',
      })
    );
  });
});
