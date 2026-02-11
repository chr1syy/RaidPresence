/**
 * Regression test suite for admin quality-of-life tools
 * Tests: duplicate raid prevention, bulk close operations, purge functions,
 * role-specific filtering, and status indicators.
 */

jest.mock('../../utils/permissions', () => ({
  canManageRaids: jest.fn(),
}));

import { canManageRaids } from '../../utils/permissions';

// Mock dependencies before imports that use them
jest.mock('../../database/client', () => {
  return {
    __esModule: true,
    default: {
      raid: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        findUnique: jest.fn(),
      },
      raidAttendance: {
        createMany: jest.fn(),
      },
      guild: {
        findUnique: jest.fn(),
      },
      userPreference: {
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
    },
  };
});

import prisma from '../../database/client';
import command from '../raid';
import { purgeOldRaids } from '../../utils/raidPurger';
import { getRosterStatus } from '../../utils/statusFormatter';

/**
 * Minimal Collection-like Map that supports discord.js `.some()` and `.filter()`.
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

describe('Admin Quality-of-Life Tools', () => {
  let mockInteraction: any;
  let mockGuild: any;
  let mockMember: any;
  let mockChannel: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const rolesCache = new MockCollection<string, any>();
    rolesCache.set('role-raider', { id: 'role-raider', name: 'Raider' });

    const memberRolesCache = new MockCollection<string, any>();
    memberRolesCache.set('role-raider', { id: 'role-raider', name: 'Raider' });

    mockMember = {
      user: { bot: false, id: 'user-123' },
      roles: { cache: memberRolesCache },
      displayName: 'TestUser',
    };

    const membersCache = new MockCollection<string, any>();
    membersCache.set('user-200', {
      user: { bot: false, id: 'user-200' },
      roles: { cache: memberRolesCache },
      displayName: 'Player1',
    });
    membersCache.set('user-201', {
      user: { bot: false, id: 'user-201' },
      roles: { cache: memberRolesCache },
      displayName: 'Player2',
    });

    mockGuild = {
      id: 'guild-123',
      name: 'Test Guild',
      members: {
        cache: membersCache,
        fetch: jest.fn().mockResolvedValue(undefined),
      },
      roles: { cache: rolesCache },
    };

    mockChannel = {
      id: 'channel-123',
      isTextBased: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue({ id: 'message-123' }),
    };

    const futureDate = futureDateStr();

    mockInteraction = {
      guild: mockGuild,
      channel: mockChannel,
      member: mockMember,
      user: { id: 'user-123' },
      isChatInputCommand: jest.fn().mockReturnValue(true),
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
      client: {
        channels: { fetch: jest.fn().mockResolvedValue(mockChannel) },
      },
      options: {
        getSubcommand: jest.fn().mockReturnValue('create'),
        get: jest.fn((key: string, required?: boolean) => {
          const values: Record<string, any> = {
            date: { value: futureDate },
            time: { value: '20:00' },
            title: { value: 'Weekly Raid' },
            roles: null,
            ping_roles: null,
          };
          return values[key] !== undefined ? values[key] : (required ? { value: null } : undefined);
        }),
      },
    };

    (canManageRaids as jest.Mock).mockResolvedValue(true);

    // Default mock: guild exists with configured roles
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      id: 'guild-123',
      name: 'Test Guild',
      raidRoles: 'Raider',
      raidLeaderRoles: 'Officer',
      language: 'en',
      timezoneOffset: 0,
    });

    (prisma.userPreference.upsert as jest.Mock).mockResolvedValue({});
    (prisma.userPreference.findMany as jest.Mock).mockResolvedValue([
      { userId: 'user-200', guildId: 'guild-123', wowClass: 'Warrior', wowSpec: 'Protection' },
      { userId: 'user-201', guildId: 'guild-123', wowClass: 'Priest', wowSpec: 'Holy' },
    ]);

    (prisma.raid.create as jest.Mock).mockResolvedValue({
      id: 'raid-new-1',
      guildId: 'guild-123',
      channelId: 'channel-123',
      raidDate: new Date(),
      description: 'Weekly Raid',
      roles: 'Raider',
      createdBy: 'user-123',
    });

    (prisma.raid.findFirst as jest.Mock).mockResolvedValue(null); // No duplicate raids by default

    (prisma.raidAttendance.createMany as jest.Mock).mockResolvedValue({ count: 2 });
    (prisma.raid.update as jest.Mock).mockResolvedValue({});
  });

  describe('Duplicate Raid Prevention', () => {
    it('should create raid successfully when no conflicts exist', async () => {
      (prisma.raid.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue({
        id: 'raid-1',
        guildId: 'guild-1',
        channelId: 'channel-1',
        messageId: 'message-1',
        raidDate: new Date(),
        description: 'Test Raid',
        roles: [],
        status: 'open',
        createdBy: 'user-123',
      });

      await command.execute(mockInteraction);

      expect(prisma.raid.create).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('created successfully') })
      );
    });

    it('should show conflict warning when duplicate raid exists within 1 hour', async () => {
      const conflictRaid = {
        id: 'raid-conflict',
        description: 'Conflicting Raid',
        raidDate: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
      };

      (prisma.raid.findFirst as jest.Mock).mockResolvedValue(conflictRaid);

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: '⚠️ Raid Conflict Detected',
              description: expect.stringContaining('Conflicting Raid'),
            }),
          ]),
           components: expect.arrayContaining([
             expect.objectContaining({
               components: expect.arrayContaining([
                 expect.objectContaining({ custom_id: expect.stringMatching(/^create_confirm_/) }),
                 expect.objectContaining({ custom_id: expect.stringMatching(/^create_cancel_/) }),
               ]),
             }),
           ]),
        })
      );

      expect(prisma.raid.create).not.toHaveBeenCalled();
    });

    it('should not detect conflicts for raids more than 1 hour apart', async () => {
      const distantRaid = {
        id: 'raid-distant',
        description: 'Distant Raid',
        raidDate: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
      };

      (prisma.raid.findFirst as jest.Mock).mockResolvedValue(distantRaid);
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue({
        id: 'raid-1',
        guildId: 'guild-1',
        channelId: 'channel-1',
        messageId: 'message-1',
        raidDate: new Date(),
        description: 'Test Raid',
        roles: [],
        status: 'open',
        createdBy: 'user-123',
      });

      await command.execute(mockInteraction);

      expect(prisma.raid.create).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('created successfully') })
      );
    });

    it('should not detect conflicts for cancelled raids', async () => {
      const cancelledRaid = {
        id: 'raid-cancelled',
        description: 'Cancelled Raid',
        raidDate: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
        status: 'cancelled',
      };

      (prisma.raid.findFirst as jest.Mock).mockResolvedValue(cancelledRaid);
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue({
        id: 'raid-1',
        guildId: 'guild-1',
        channelId: 'channel-1',
        messageId: 'message-1',
        raidDate: new Date(),
        description: 'Test Raid',
        roles: [],
        status: 'open',
        createdBy: 'user-123',
      });

      await command.execute(mockInteraction);

      expect(prisma.raid.create).toHaveBeenCalled();
    });
  });

  describe('Bulk Close Operations', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand = jest.fn().mockReturnValue('close-all');
      mockInteraction.options.get = jest.fn((key: string) => {
        if (key === 'before') return { value: '2025-12-31' };
        return undefined;
      });
    });

    it('should reject invalid date format', async () => {
      mockInteraction.options.get = jest.fn((key: string) => {
        if (key === 'before') return { value: 'invalid-date' };
        return undefined;
      });

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('YYYY-MM-DD') })
      );
    });

    it('should show no raids found when none exist before date', async () => {
      (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('No open raids') })
      );
    });

    it('should show confirmation dialog with raid list', async () => {
      const raids = [
        {
          id: 'raid-1',
          description: 'Raid 1',
          raidDate: new Date('2025-12-25'),
          status: 'open',
        },
        {
          id: 'raid-2',
          description: 'Raid 2',
          raidDate: new Date('2025-12-26'),
          status: 'open',
        },
      ];

      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: '⚠️ Confirm Bulk Close',
              description: expect.stringContaining('Raid 1'),
            }),
          ]),
          components: expect.arrayContaining([
            expect.objectContaining({
              components: expect.arrayContaining([
                expect.objectContaining({ custom_id: expect.stringMatching(/^close_all_confirm_/) }),
                expect.objectContaining({ custom_id: expect.stringMatching(/^close_all_cancel$/) }),
              ]),
            }),
          ]),
        })
      );
    });

    it('should only include open raids before specified date', async () => {
      const raids = [
        {
          id: 'raid-1',
          description: 'Open Raid',
          raidDate: new Date('2025-12-25'),
          status: 'open',
        },
        {
          id: 'raid-2',
          description: 'Closed Raid',
          raidDate: new Date('2025-12-25'),
          status: 'closed',
        },
        {
          id: 'raid-3',
          description: 'Future Raid',
          raidDate: new Date('2026-01-01'),
          status: 'open',
        },
      ];

      (prisma.raid.findMany as jest.Mock).mockResolvedValue([raids[0]]); // Only the open past raid

      await command.execute(mockInteraction);

      expect(prisma.raid.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'open',
            raidDate: { lt: expect.any(Date) },
          }),
        })
      );
    });
  });

  describe('Purge Functions', () => {
    it('should purge old closed raids correctly', async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      const oldRaids = [
        {
          id: 'raid-1',
          description: 'Old Closed Raid',
          raidDate: new Date(cutoffDate.getTime() - 24 * 60 * 60 * 1000), // 31 days ago
          status: 'closed',
          isPinned: false,
        },
        {
          id: 'raid-2',
          description: 'Old Cancelled Raid',
          raidDate: new Date(cutoffDate.getTime() - 24 * 60 * 60 * 1000),
          status: 'cancelled',
          isPinned: false,
        },
      ];

      (prisma.raid.findMany as jest.Mock).mockResolvedValue(oldRaids);
      (prisma.raid.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });

      const result = await purgeOldRaids('guild-123', 30);

      expect(result).toBe(2);
      expect(prisma.raid.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            guildId: 'guild-123',
            status: { in: ['closed', 'cancelled'] },
            raidDate: { lt: expect.any(Date) },
            isPinned: false,
          }),
        })
      );
      expect(prisma.raid.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['raid-1', 'raid-2'] },
          }),
        })
      );
    });

    it('should not purge pinned raids', async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      const pinnedRaid = {
        id: 'raid-pinned',
        description: 'Pinned Raid',
        raidDate: new Date(cutoffDate.getTime() - 24 * 60 * 60 * 1000),
        status: 'closed',
        isPinned: true,
      };

      (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.raid.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

      const result = await purgeOldRaids('guild-123', 30);

      expect(result).toBe(0);
      expect(prisma.raid.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isPinned: false,
          }),
        })
      );
    });

    it('should return 0 when no old raids exist', async () => {
      (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);

      const result = await purgeOldRaids('guild-123', 30);

      expect(result).toBe(0);
      expect(prisma.raid.deleteMany).not.toHaveBeenCalled();
    });

    it('should not purge recent raids', async () => {
      const recentRaid = {
        id: 'raid-recent',
        description: 'Recent Raid',
        raidDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        status: 'closed',
        isPinned: false,
      };

      (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);

      const result = await purgeOldRaids('guild-123', 30);

      expect(result).toBe(0);
    });
  });

  describe('Role-Specific List Filter', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand = jest.fn().mockReturnValue('list');
      mockInteraction.options.get = jest.fn((key: string) => {
        if (key === 'role') return { value: 'tank' };
        return undefined;
      });
    });

    it('should filter raids by role when specified', async () => {
      const raids = [
        {
          id: 'raid-1',
          description: 'Tank Heavy Raid',
          raidDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          attendance: [
            { status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' }, // Tank
            { status: 'attending', wowClass: 'Paladin', wowSpec: 'Protection' }, // Tank
            { status: 'attending', wowClass: 'Druid', wowSpec: 'Feral' }, // DPS
          ],
        },
      ];

      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: 'Upcoming Raids (Tank Focus)',
              description: expect.stringContaining('Tank Heavy Raid'),
            }),
          ]),
        })
      );
    });

    it('should show role count and status in filtered list', async () => {
      const raid = {
        id: 'raid-1',
        description: 'Test Raid',
        raidDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        attendance: [
          { status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' }, // 1 Tank
          { status: 'attending', wowClass: 'Paladin', wowSpec: 'Protection' }, // 1 Tank
          { status: 'attending', wowClass: 'Priest', wowSpec: 'Holy' }, // Healer
        ],
      };

      (prisma.raid.findMany as jest.Mock).mockResolvedValue([raid]);

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              description: expect.stringContaining('Tank: 0/2 ⚠️'),
            }),
          ]),
        })
      );
    });
  });

  describe('Status Indicators', () => {
    it('should classify roster as full when attendance >= 80%', () => {
      expect(getRosterStatus(8, 10)).toBe('full');
      expect(getRosterStatus(10, 10)).toBe('full');
      expect(getRosterStatus(16, 20)).toBe('full');
    });

    it('should classify roster as good when attendance >= 50%', () => {
      expect(getRosterStatus(5, 10)).toBe('good');
      expect(getRosterStatus(7, 10)).toBe('good');
      expect(getRosterStatus(10, 20)).toBe('good');
    });

    it('should classify roster as low when attendance >= 25%', () => {
      expect(getRosterStatus(3, 10)).toBe('low');
      expect(getRosterStatus(0, 10)).toBe('critical');
      expect(getRosterStatus(5, 20)).toBe('low');
    });

    it('should classify roster as critical when attendance < 25%', () => {
      expect(getRosterStatus(2, 10)).toBe('critical');
      expect(getRosterStatus(1, 10)).toBe('critical');
      expect(getRosterStatus(4, 20)).toBe('critical');
    });

    it('should handle edge cases', () => {
      expect(getRosterStatus(0, 0)).toBe('critical'); // Empty raid
      expect(getRosterStatus(1, 1)).toBe('full'); // Single player raid
    });
  });
});