/**
 * Unit tests for raidPurger utility functions
 */

import { purgeOldRaids, autoPurgeAllGuilds, manualPurgeRaids } from '../raidPurger';

// Mock dependencies
jest.mock('../../database/client', () => ({
  __esModule: true,
  default: {
    guild: {
      findMany: jest.fn(),
    },
    raid: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import prisma from '../../database/client';

const mockPrisma = prisma as any;

describe('raidPurger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('purgeOldRaids', () => {
    it('should return 0 when no old raids exist', async () => {
      mockPrisma.raid.findMany.mockResolvedValue([]);

      const result = await purgeOldRaids('guild-1', 30);

      expect(result).toBe(0);
      expect(mockPrisma.raid.findMany).toHaveBeenCalledWith({
        where: {
          guildId: 'guild-1',
          status: { in: ['closed', 'cancelled'] },
          raidDate: expect.any(Date),
          isPinned: false,
        },
        select: {
          id: true,
          description: true,
          raidDate: true,
        },
      });
      expect(mockPrisma.raid.deleteMany).not.toHaveBeenCalled();
    });

    it('should delete old raids and return count', async () => {
      const oldRaids = [
        { id: 'raid-1', description: 'Old Raid 1', raidDate: new Date('2025-01-01') },
        { id: 'raid-2', description: 'Old Raid 2', raidDate: new Date('2025-01-02') },
      ];
      mockPrisma.raid.findMany.mockResolvedValue(oldRaids);
      mockPrisma.raid.deleteMany.mockResolvedValue({ count: 2 });

      const result = await purgeOldRaids('guild-1', 30);

      expect(result).toBe(2);
      expect(mockPrisma.raid.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['raid-1', 'raid-2'] },
        },
      });
    });
  });

  describe('autoPurgeAllGuilds', () => {
    it('should purge for enabled guilds and log results', async () => {
      const guilds = [
        { id: 'guild-1', name: 'Guild 1', autoPurgeEnabled: true, autoPurgeDays: 30 },
        { id: 'guild-2', name: 'Guild 2', autoPurgeEnabled: true, autoPurgeDays: 60 },
      ];
      mockPrisma.guild.findMany.mockResolvedValue(guilds);
      mockPrisma.raid.findMany.mockResolvedValue([
        { id: 'raid-1', description: 'Old Raid', raidDate: new Date('2025-01-01') },
      ]);
      mockPrisma.raid.deleteMany.mockResolvedValue({ count: 1 });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await autoPurgeAllGuilds();

      expect(mockPrisma.guild.findMany).toHaveBeenCalledWith({
        where: { autoPurgeEnabled: true },
      });
      expect(consoleSpy).toHaveBeenCalledWith('🗑️ Auto-purged 1 old raids for guild Guild 1 (guild-1)');
      expect(consoleSpy).toHaveBeenCalledWith('🗑️ Auto-purged 1 old raids for guild Guild 2 (guild-2)');
      expect(consoleSpy).toHaveBeenCalledWith('✅ Auto-purge completed: deleted 2 old raids total');

      consoleSpy.mockRestore();
    });

    it('should handle no guilds with auto-purge', async () => {
      mockPrisma.guild.findMany.mockResolvedValue([]);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await autoPurgeAllGuilds();

      expect(consoleSpy).toHaveBeenCalledWith('✅ Auto-purge completed: no old raids to delete');

      consoleSpy.mockRestore();
    });
  });

  describe('manualPurgeRaids', () => {
    it('should return dry run results', async () => {
      const oldRaids = [
        { id: 'raid-1', description: 'Old Raid', raidDate: new Date('2025-01-01'), status: 'closed' },
      ];
      mockPrisma.raid.findMany.mockResolvedValue(oldRaids);

      const result = await manualPurgeRaids('guild-1', 30, true);

      expect(result).toEqual({
        count: 1,
        raids: oldRaids,
        deleted: false,
      });
      expect(mockPrisma.raid.deleteMany).not.toHaveBeenCalled();
    });

    it('should delete raids and return results', async () => {
      const oldRaids = [
        { id: 'raid-1', description: 'Old Raid', raidDate: new Date('2025-01-01'), status: 'closed' },
      ];
      mockPrisma.raid.findMany.mockResolvedValue(oldRaids);
      mockPrisma.raid.deleteMany.mockResolvedValue({ count: 1 });

      const result = await manualPurgeRaids('guild-1', 30, false);

      expect(result).toEqual({
        count: 1,
        raids: oldRaids,
        deleted: true,
      });
      expect(mockPrisma.raid.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['raid-1'] },
        },
      });
    });

    it('should return empty results when no raids', async () => {
      mockPrisma.raid.findMany.mockResolvedValue([]);

      const result = await manualPurgeRaids('guild-1', 30, false);

      expect(result).toEqual({
        count: 0,
        raids: [],
        deleted: true,
      });
    });
  });
});