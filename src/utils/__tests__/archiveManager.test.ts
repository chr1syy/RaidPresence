import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import prisma from '../../database/client';
import {
  archiveRaid,
  unarchiveRaid,
  getArchiveChannel,
  setupArchiveChannel,
  searchArchive,
  getArchiveStats,
  ArchiveSearchFilter
} from '../archiveManager';

// Mock Prisma
jest.mock('../../database/client', () => ({
  __esModule: true,
  default: {
    guild: { findUnique: jest.fn(), update: jest.fn() },
    raid: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), count: jest.fn() }
  }
}));

describe('archiveManager', () => {
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      channels: {
        fetch: jest.fn()
      }
    };
  });

  describe('archiveRaid', () => {
    it('should throw error if archive channel not configured', async () => {
      const raidId = 'raid-123';
      const guildId = 'guild-123';

      const mockGuild = { id: guildId, archiveChannelId: null };
      (prisma.guild.findUnique as any).mockResolvedValue(mockGuild);

      await expect(archiveRaid(raidId, guildId, mockClient))
        .rejects
        .toThrow('Archive channel not configured');
    });

    it('should throw error if raid not found', async () => {
      const raidId = 'raid-123';
      const guildId = 'guild-123';

      const mockGuild = { id: guildId, archiveChannelId: 'archive-123' };
      (prisma.guild.findUnique as any).mockResolvedValue(mockGuild);
      (prisma.raid.findUnique as any).mockResolvedValue(null);

      await expect(archiveRaid(raidId, guildId, mockClient))
        .rejects
        .toThrow('not found');
    });

    it('should enforce guild isolation', async () => {
      const raidId = 'raid-123';
      const guildId = 'guild-123';
      const wrongGuildId = 'guild-456';

      const mockGuild = { id: guildId, archiveChannelId: 'archive-123' };
      const mockRaid = { id: raidId, guildId: wrongGuildId };

      (prisma.guild.findUnique as any).mockResolvedValue(mockGuild);
      (prisma.raid.findUnique as any).mockResolvedValue(mockRaid);

      await expect(archiveRaid(raidId, guildId, mockClient))
        .rejects
        .toThrow('Guild isolation');
    });
  });

  describe('unarchiveRaid', () => {
    it('should throw error if raid not found', async () => {
      const raidId = 'raid-123';
      const guildId = 'guild-123';

      (prisma.raid.findUnique as any).mockResolvedValue(null);

      await expect(unarchiveRaid(raidId, guildId, mockClient))
        .rejects
        .toThrow('not found');
    });

    it('should throw error if raid not archived', async () => {
      const raidId = 'raid-123';
      const guildId = 'guild-123';

      const mockRaid = {
        id: raidId,
        guildId,
        isPinned: false
      };

      (prisma.raid.findUnique as any).mockResolvedValue(mockRaid);

      await expect(unarchiveRaid(raidId, guildId, mockClient))
        .rejects
        .toThrow('not archived');
    });

    it('should enforce guild isolation on unarchive', async () => {
      const raidId = 'raid-123';
      const guildId = 'guild-123';
      const wrongGuildId = 'guild-456';

      const mockRaid = {
        id: raidId,
        guildId: wrongGuildId,
        isPinned: true
      };

      (prisma.raid.findUnique as any).mockResolvedValue(mockRaid);

      await expect(unarchiveRaid(raidId, guildId, mockClient))
        .rejects
        .toThrow('Guild isolation');
    });
  });

  describe('getArchiveChannel', () => {
    it('should throw error if archive channel not configured', async () => {
      const guildId = 'guild-123';

      const mockGuild = { id: guildId, archiveChannelId: null };
      (prisma.guild.findUnique as any).mockResolvedValue(mockGuild);

      await expect(getArchiveChannel(guildId, mockClient))
        .rejects
        .toThrow('not configured');
    });

    it('should throw error if guild not found', async () => {
      const guildId = 'guild-123';

      (prisma.guild.findUnique as any).mockResolvedValue(null);

      await expect(getArchiveChannel(guildId, mockClient))
        .rejects
        .toThrow('not configured');
    });
  });

  describe('setupArchiveChannel', () => {
    it('should throw error if channel not accessible', async () => {
      const guildId = 'guild-123';
      const channelId = 'invalid-channel';

      (mockClient.channels.fetch as any).mockRejectedValue(new Error('Not found'));

      await expect(setupArchiveChannel(guildId, channelId, mockClient))
        .rejects
        .toThrow('invalid or not accessible');
    });
  });

  describe('searchArchive', () => {
    it('should search archived raids by date range', async () => {
      const guildId = 'guild-123';
      const startDate = new Date('2026-02-01');
      const endDate = new Date('2026-02-28');

      const mockRaids = [
        {
          id: 'raid-1',
          description: 'Raid A',
          raidDate: new Date('2026-02-15'),
          archivedAt: new Date(),
          archiveChannelId: 'archive-123',
          attendance: [
            { id: 'att-1', userId: 'user-1', username: 'Player1', status: 'attending' },
            { id: 'att-2', userId: 'user-2', username: 'Player2', status: 'opted_out' }
          ]
        }
      ];

      (prisma.raid.findMany as any).mockResolvedValue(mockRaids);

      const filters: ArchiveSearchFilter = {
        guildId,
        startDate,
        endDate
      };

      const results = await searchArchive(filters);

      expect(results).toHaveLength(1);
      expect(results[0].raidId).toBe('raid-1');
      expect(results[0].attendedCount).toBe(1);
      expect(results[0].totalInvited).toBe(2);
    });

    it('should search archived raids by query', async () => {
      const guildId = 'guild-123';

      const mockRaids = [
        {
          id: 'raid-1',
          description: 'Mythic+ Run',
          raidDate: new Date('2026-02-15'),
          archivedAt: new Date(),
          archiveChannelId: 'archive-123',
          attendance: [
            { id: 'att-1', userId: 'user-1', username: 'Alice', status: 'attending' }
          ]
        },
        {
          id: 'raid-2',
          description: 'Regular Raid',
          raidDate: new Date('2026-02-14'),
          archivedAt: new Date(),
          archiveChannelId: 'archive-123',
          attendance: [
            { id: 'att-2', userId: 'user-2', username: 'Bob', status: 'attending' }
          ]
        }
      ];

      // Mock findMany to filter based on query in the WHERE clause
      (prisma.raid.findMany as any).mockImplementation((args: any) => {
        let filtered = mockRaids;
        
        // Apply description filter if query is in WHERE clause
        if (args.where?.OR) {
          filtered = mockRaids.filter(raid => {
            const matchesDescription = raid.description?.toLowerCase().includes('mythic');
            const matchesPlayer = raid.attendance?.some((a: any) => a.username?.toLowerCase().includes('mythic'));
            return matchesDescription || matchesPlayer;
          });
        }
        
        return Promise.resolve(filtered);
      });

      const filters: ArchiveSearchFilter = {
        guildId,
        query: 'Mythic'
      };

      const results = await searchArchive(filters);

      expect(results).toHaveLength(1);
      expect(results[0].raidId).toBe('raid-1');
    });

    it('should search by player name', async () => {
      const guildId = 'guild-123';

      const mockRaids = [
        {
          id: 'raid-1',
          description: 'Raid A',
          raidDate: new Date('2026-02-15'),
          archivedAt: new Date(),
          archiveChannelId: 'archive-123',
          attendance: [
            { id: 'att-1', userId: 'user-1', username: 'Alice', status: 'attending' }
          ]
        },
        {
          id: 'raid-2',
          description: 'Raid B',
          raidDate: new Date('2026-02-14'),
          archivedAt: new Date(),
          archiveChannelId: 'archive-123',
          attendance: [
            { id: 'att-2', userId: 'user-2', username: 'Bob', status: 'attending' }
          ]
        }
      ];

      // Mock findMany to filter based on query in the WHERE clause
      (prisma.raid.findMany as any).mockImplementation((args: any) => {
        let filtered = mockRaids;
        
        // Apply player name filter if query is in WHERE clause
        if (args.where?.OR) {
          filtered = mockRaids.filter(raid => {
            const matchesDescription = raid.description?.toLowerCase().includes('alice');
            const matchesPlayer = raid.attendance?.some((a: any) => a.username?.toLowerCase().includes('alice'));
            return matchesDescription || matchesPlayer;
          });
        }
        
        return Promise.resolve(filtered);
      });

      const filters: ArchiveSearchFilter = {
        guildId,
        query: 'Alice'
      };

      const results = await searchArchive(filters);

      expect(results).toHaveLength(1);
      expect(results[0].raidId).toBe('raid-1');
    });

    it('should calculate attendance percentage correctly', async () => {
      const guildId = 'guild-123';

      const mockRaids = [
        {
          id: 'raid-1',
          description: 'Test Raid',
          raidDate: new Date('2026-02-15'),
          archivedAt: new Date(),
          archiveChannelId: 'archive-123',
          attendance: [
            { username: 'Player1', status: 'attending' },
            { username: 'Player2', status: 'attending' },
            { username: 'Player3', status: 'opted_out' }
          ]
        }
      ];

      (prisma.raid.findMany as any).mockResolvedValue(mockRaids);

      const results = await searchArchive({ guildId });

      expect(results[0].attendancePercent).toBe(67); // 2 out of 3
    });

    it('should limit participant names to 5', async () => {
      const guildId = 'guild-123';

      const mockRaids = [
        {
          id: 'raid-1',
          description: 'Large Raid',
          raidDate: new Date('2026-02-15'),
          archivedAt: new Date(),
          archiveChannelId: 'archive-123',
          attendance: Array.from({ length: 10 }, (_, i) => ({
            username: `Player${i + 1}`,
            status: i < 8 ? 'attending' : 'opted_out'
          }))
        }
      ];

      (prisma.raid.findMany as any).mockResolvedValue(mockRaids);

      const results = await searchArchive({ guildId });

      expect(results[0].participantNames).toHaveLength(5);
    });

    it('should return empty list if no matches', async () => {
      const guildId = 'guild-123';

      (prisma.raid.findMany as any).mockResolvedValue([]);

      const results = await searchArchive({ guildId });

      expect(results).toHaveLength(0);
    });
  });

  describe('getArchiveStats', () => {
    it('should return archive statistics', async () => {
      const guildId = 'guild-123';

      (prisma.raid.count as any).mockResolvedValueOnce(3); // total archived
      (prisma.raid.count as any).mockResolvedValueOnce(2); // recently archived

      const stats = await getArchiveStats(guildId);

      expect(stats.totalArchived).toBe(3);
      expect(stats.recentArchived).toBe(2); // Within last 30 days
      expect(prisma.raid.count).toHaveBeenCalledTimes(2);
    });

    it('should return zero stats for guild with no archives', async () => {
      const guildId = 'guild-123';

      (prisma.raid.count as any).mockResolvedValueOnce(0); // total archived
      (prisma.raid.count as any).mockResolvedValueOnce(0); // recently archived

      const stats = await getArchiveStats(guildId);

      expect(stats.totalArchived).toBe(0);
      expect(stats.recentArchived).toBe(0);
      expect(prisma.raid.count).toHaveBeenCalledTimes(2);
    });
  });
});
