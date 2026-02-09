/**
 * Test suite for handleCloneRaid() function
 * Tests: permission checks, date/time validation, raid cloning logic,
 * attendance creation, timezone handling, and error paths.
 */

import { canManageRaids } from '../../utils/permissions';

// Mock dependencies before imports that use them
jest.mock('../../database/client');
jest.mock('../../utils/permissions');

import prisma from '../../database/client';
import command from '../raid';

/**
 * Minimal Collection-like Map that supports discord.js `.some()` and `.filter()`.
 * Discord.js Collection extends Map with these utility methods.
 */
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
}

// Helper: build a future date string (YYYY-MM-DD) N days from now
function futureDateStr(daysFromNow = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

// Reusable source raid factory
function makeSourceRaid(overrides: Record<string, any> = {}) {
  return {
    id: 'source-raid-1',
    guildId: 'guild-123',
    channelId: 'channel-123',
    raidDate: new Date('2026-03-01T18:00:00Z'),
    description: 'Mythic Raid Night',
    roles: 'role-raider',
    status: 'open',
    createdBy: 'user-leader',
    messageId: 'msg-original',
    createdFromTemplateId: null,
    clonedAt: null,
    templateName: null,
    isTemplate: false,
    templateVersion: 1,
    guild: {
      id: 'guild-123',
      language: 'en',
      timezoneOffset: 0,
      raidLeaderRoles: 'role-leader',
    },
    ...overrides,
  };
}

// Build a mock interaction suitable for the clone subcommand
function buildMockInteraction(optionOverrides: Record<string, any> = {}, extras: Record<string, any> = {}) {
  const options: Record<string, any> = {
    raid_id: { value: 'source-raid-1' },
    date: { value: futureDateStr() },
    time: undefined,
    title: undefined,
    ...optionOverrides,
  };

  const memberRolesCache = new MockCollection<string, any>();
  memberRolesCache.set('role-raider', { id: 'role-raider', name: 'Raider' });

  const raiderMember = {
    user: { bot: false, id: 'user-raider-1' },
    displayName: 'RaiderOne',
    roles: { cache: memberRolesCache },
  };

  const botMember = {
    user: { bot: true, id: 'bot-1' },
    displayName: 'BotUser',
    roles: { cache: memberRolesCache },
  };

  const memberWithoutRole = {
    user: { bot: false, id: 'user-norole' },
    displayName: 'NoRoleUser',
    roles: { cache: new MockCollection() },
  };

  const membersCache = new Map<string, any>();
  membersCache.set('user-raider-1', raiderMember);
  membersCache.set('bot-1', botMember);
  membersCache.set('user-norole', memberWithoutRole);

  const sentMessage = { id: 'msg-new-123' };

  const mockInteraction: any = {
    isChatInputCommand: jest.fn().mockReturnValue(true),
    guild: {
      id: 'guild-123',
      name: 'Test Guild',
      members: {
        cache: membersCache,
        fetch: jest.fn().mockResolvedValue(undefined),
      },
      roles: { cache: new Map() },
    },
    channel: {
      id: 'channel-123',
      isTextBased: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue(sentMessage),
    },
    member: {
      user: { bot: false, id: 'user-leader' },
      roles: { cache: new Map() },
      displayName: 'Leader',
    },
    user: { id: 'user-leader' },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    client: {
      channels: {
        fetch: jest.fn().mockResolvedValue({
          isTextBased: jest.fn().mockReturnValue(true),
          messages: { fetch: jest.fn() },
        }),
      },
    },
    options: {
      getSubcommand: jest.fn().mockReturnValue('clone'),
      get: jest.fn((key: string, required?: boolean) => {
        return options[key] || (required ? { value: null } : undefined);
      }),
    },
    ...extras,
  };

  return mockInteraction;
}

/**
 * Set up prisma mocks for a full successful clone flow.
 * Handles two findUnique calls: source raid lookup + createRaidEmbed lookup.
 */
function setupPrismaMocks(sourceRaid = makeSourceRaid()) {
  const attendanceRecord = {
    id: 'att-1',
    raidId: 'new-raid-1',
    userId: 'user-raider-1',
    guildId: 'guild-123',
    username: 'RaiderOne',
    status: 'attending',
    wowClass: 'Warrior',
    wowSpec: 'Protection',
  };

  // Reset findUnique to avoid stacking from beforeEach
  (prisma.raid.findUnique as jest.Mock).mockReset();

  // First call: handleCloneRaid looks up source raid
  // Second call: createRaidEmbed looks up newly created raid with attendance
  (prisma.raid.findUnique as jest.Mock)
    .mockResolvedValueOnce(sourceRaid)
    .mockResolvedValueOnce({
      id: 'new-raid-1',
      guildId: 'guild-123',
      channelId: 'channel-123',
      raidDate: new Date(),
      description: sourceRaid.description || 'Cloned Raid',
      roles: sourceRaid.roles,
      createdBy: 'user-leader',
      status: 'open',
      messageId: null,
      guild: sourceRaid.guild,
      attendance: [attendanceRecord],
    });

  (prisma.raid.create as jest.Mock).mockResolvedValue({
    id: 'new-raid-1',
    guildId: 'guild-123',
    channelId: 'channel-123',
    raidDate: new Date(),
    description: sourceRaid.description || 'Cloned Raid',
    roles: sourceRaid.roles,
    createdBy: 'user-leader',
    createdFromTemplateId: sourceRaid.id,
    clonedAt: new Date(),
    status: 'open',
    messageId: null,
  });
  (prisma.raid.update as jest.Mock).mockResolvedValue({});
  (prisma.raidAttendance.createMany as jest.Mock).mockResolvedValue({ count: 1 });
  (prisma.userPreference.upsert as jest.Mock).mockResolvedValue({});
  (prisma.userPreference.findMany as jest.Mock).mockResolvedValue([
    {
      userId: 'user-raider-1',
      guildId: 'guild-123',
      username: 'RaiderOne',
      wowClass: 'Warrior',
      wowSpec: 'Protection',
    },
  ]);
}

describe('handleCloneRaid()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (canManageRaids as jest.Mock).mockResolvedValue(true);
    setupPrismaMocks();
  });

  describe('Successful cloning', () => {
    it('should clone a valid raid with a new date', async () => {
      const dateStr = futureDateStr();
      const interaction = buildMockInteraction({ date: { value: dateStr } });

      await command.execute(interaction);

      // Should defer reply
      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      // Should look up source raid
      expect(prisma.raid.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'source-raid-1' },
          include: { guild: true },
        })
      );
      // Should create a new raid
      expect(prisma.raid.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            guildId: 'guild-123',
            channelId: 'channel-123',
            description: 'Mythic Raid Night',
            roles: 'role-raider',
            createdBy: 'user-leader',
            createdFromTemplateId: 'source-raid-1',
          }),
        })
      );
      // Should create attendance records
      expect(prisma.raidAttendance.createMany).toHaveBeenCalled();
      // Should send embed to channel
      expect(interaction.channel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
        })
      );
      // Should update raid with message ID
      expect(prisma.raid.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'new-raid-1' },
          data: { messageId: 'msg-new-123' },
        })
      );
      // Should reply with success
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Mythic Raid Night'),
        })
      );
    });

    it('should clone with a custom title', async () => {
      const interaction = buildMockInteraction({
        date: { value: futureDateStr() },
        title: { value: 'Alt Raid Night' },
      });

      await command.execute(interaction);

      expect(prisma.raid.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: 'Alt Raid Night',
          }),
        })
      );
    });

    it('should preserve raid roles from source', async () => {
      const sourceRaid = makeSourceRaid({ roles: 'role-raider,role-backup' });
      setupPrismaMocks(sourceRaid);

      const interaction = buildMockInteraction();
      await command.execute(interaction);

      expect(prisma.raid.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            roles: 'role-raider,role-backup',
          }),
        })
      );
    });

    it('should create fresh attendance with "attending" status for eligible members', async () => {
      const interaction = buildMockInteraction();
      await command.execute(interaction);

      const createManyCall = (prisma.raidAttendance.createMany as jest.Mock).mock.calls[0][0];
      const attendanceData = createManyCall.data;

      // Only non-bot members with the correct role should be included
      // user-raider-1 has role-raider; bot-1 is a bot; user-norole has no roles
      expect(attendanceData).toHaveLength(1);
      expect(attendanceData[0]).toEqual(
        expect.objectContaining({
          raidId: 'new-raid-1',
          userId: 'user-raider-1',
          guildId: 'guild-123',
          status: 'attending',
        })
      );
    });
  });

  describe('Permission checks', () => {
    it('should reject users without raid management permission', async () => {
      (canManageRaids as jest.Mock).mockResolvedValue(false);
      const interaction = buildMockInteraction();

      await command.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('permission'),
        })
      );
      expect(prisma.raid.create).not.toHaveBeenCalled();
    });

    it('should reject when guild is missing', async () => {
      const interaction = buildMockInteraction({}, { guild: null });

      await command.execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('server'),
          ephemeral: true,
        })
      );
      expect(prisma.raid.create).not.toHaveBeenCalled();
    });

    it('should reject when channel is missing', async () => {
      const interaction = buildMockInteraction({}, { channel: null });

      await command.execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('server'),
          ephemeral: true,
        })
      );
      expect(prisma.raid.create).not.toHaveBeenCalled();
    });
  });

  describe('Input validation', () => {
    it('should reject invalid date format', async () => {
      const interaction = buildMockInteraction({ date: { value: '25-12-2026' } });

      await command.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('YYYY-MM-DD'),
        })
      );
      expect(prisma.raid.create).not.toHaveBeenCalled();
    });

    it('should reject invalid time format when provided', async () => {
      const interaction = buildMockInteraction({
        date: { value: futureDateStr() },
        time: { value: '25:99' },
      });

      await command.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('hour'),
        })
      );
      expect(prisma.raid.create).not.toHaveBeenCalled();
    });

    it('should reject clone of non-existent raid', async () => {
      (prisma.raid.findUnique as jest.Mock).mockReset();
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(null);
      const interaction = buildMockInteraction();

      await command.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('not found'),
        })
      );
      expect(prisma.raid.create).not.toHaveBeenCalled();
    });

    it('should reject clone of raid from a different guild', async () => {
      const foreignRaid = makeSourceRaid({ guildId: 'other-guild-999' });
      (prisma.raid.findUnique as jest.Mock).mockReset();
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(foreignRaid);

      const interaction = buildMockInteraction();
      await command.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('does not belong'),
        })
      );
      expect(prisma.raid.create).not.toHaveBeenCalled();
    });
  });

  describe('Timezone handling', () => {
    it('should apply positive timezone offset correctly', async () => {
      const offsetHours = 2;
      const sourceRaid = makeSourceRaid({
        guild: {
          id: 'guild-123',
          language: 'en',
          timezoneOffset: offsetHours, // UTC+2
          raidLeaderRoles: 'role-leader',
        },
      });
      setupPrismaMocks(sourceRaid);

      const dateStr = futureDateStr();
      const interaction = buildMockInteraction({
        date: { value: dateStr },
        time: { value: '20:00' },
      });

      await command.execute(interaction);

      // Code does: new Date(`${date}T20:00:00`) then subtracts offset*3600000
      // The local parse depends on system TZ, so verify the offset was applied:
      const localParsed = new Date(`${dateStr}T20:00:00`);
      const expected = new Date(localParsed.getTime() - offsetHours * 60 * 60 * 1000);

      const createCall = (prisma.raid.create as jest.Mock).mock.calls[0][0];
      const storedDate: Date = createCall.data.raidDate;
      expect(storedDate.getTime()).toBe(expected.getTime());
    });

    it('should extract time from source raid when time not provided', async () => {
      // Source raid at 2026-03-01T18:00:00Z with offset=0 => extracted local time 18:00
      const sourceRaid = makeSourceRaid();
      setupPrismaMocks(sourceRaid);

      const dateStr = futureDateStr();
      const interaction = buildMockInteraction({ date: { value: dateStr } });

      await command.execute(interaction);

      // With offset=0: code extracts 18:00 from source, then new Date(`${date}T18:00:00`) - 0
      const localParsed = new Date(`${dateStr}T18:00:00`);

      const createCall = (prisma.raid.create as jest.Mock).mock.calls[0][0];
      const storedDate: Date = createCall.data.raidDate;
      expect(storedDate.getTime()).toBe(localParsed.getTime());
    });

    it('should handle negative timezone offset', async () => {
      const offsetHours = -5;
      const sourceRaid = makeSourceRaid({
        guild: {
          id: 'guild-123',
          language: 'en',
          timezoneOffset: offsetHours, // UTC-5
          raidLeaderRoles: 'role-leader',
        },
      });
      setupPrismaMocks(sourceRaid);

      const dateStr = futureDateStr();
      const interaction = buildMockInteraction({
        date: { value: dateStr },
        time: { value: '20:00' },
      });

      await command.execute(interaction);

      // Code does: new Date(`${date}T20:00:00`) then subtracts offset*3600000
      // -(-5) = +5, so stored is 5h later than local parse
      const localParsed = new Date(`${dateStr}T20:00:00`);
      const expected = new Date(localParsed.getTime() - offsetHours * 60 * 60 * 1000);

      const createCall = (prisma.raid.create as jest.Mock).mock.calls[0][0];
      const storedDate: Date = createCall.data.raidDate;
      expect(storedDate.getTime()).toBe(expected.getTime());
    });
  });

  describe('Edge cases', () => {
    it('should reject clone when source raid has no roles', async () => {
      const sourceRaid = makeSourceRaid({ roles: '' });
      setupPrismaMocks(sourceRaid);

      const interaction = buildMockInteraction();
      await command.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('no roles'),
        })
      );
      expect(prisma.raid.create).not.toHaveBeenCalled();
    });

    it('should reject clone when no eligible members found', async () => {
      const interaction = buildMockInteraction();
      interaction.guild.members.cache = new Map();
      interaction.guild.members.cache.set('bot-1', {
        user: { bot: true, id: 'bot-1' },
        displayName: 'BotUser',
        roles: { cache: new MockCollection() },
      });

      await command.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('eligible'),
        })
      );
      expect(prisma.raid.create).not.toHaveBeenCalled();
    });

    it('should use default title when source raid has no description and no override', async () => {
      const sourceRaid = makeSourceRaid({ description: null });
      setupPrismaMocks(sourceRaid);

      const interaction = buildMockInteraction();
      await command.execute(interaction);

      expect(prisma.raid.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: 'Cloned Raid',
          }),
        })
      );
    });

    it('should upsert UserPreference for each eligible member', async () => {
      const interaction = buildMockInteraction();
      await command.execute(interaction);

      expect(prisma.userPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_guildId: {
              userId: 'user-raider-1',
              guildId: 'guild-123',
            },
          },
          update: { username: 'RaiderOne' },
          create: {
            userId: 'user-raider-1',
            guildId: 'guild-123',
            username: 'RaiderOne',
          },
        })
      );
    });
  });
});
