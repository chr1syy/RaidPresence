// Mock dependencies BEFORE imports
jest.mock('../../database/client', () => ({
  __esModule: true,
  default: { raid: { findMany: jest.fn(), update: jest.fn() } },
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}));
jest.mock('../archiveManager');
jest.mock('../../commands/raid', () => ({
  createRaidEmbed: jest.fn(),
}));

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import prisma from '../../database/client';
import { archiveRaid } from '../archiveManager';
import { createRaidEmbed } from '../../commands/raid';

describe('raidScheduler', () => {
  let mockClient: any;
  let logSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockClient = {
      channels: {
        fetch: jest.fn(),
      },
    };

    // Suppress console logs during tests
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Setup prisma mocks
    (prisma as any).raid = {
      findMany: jest.fn(),
      update: jest.fn(),
    };

    // Setup createRaidEmbed mock
    (createRaidEmbed as jest.Mock<any>).mockResolvedValue({ title: 'Test Raid' });
  });

  afterEach(() => {
    jest.useRealTimers();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('checkAndCloseExpiredRaids - Archive failure fallback', () => {
    it('should update message when archiveRaid() fails', async () => {
      const raidId = 'raid-123';
      const guildId = 'guild-123';
      const channelId = 'channel-123';
      const messageId = 'message-123';

      const mockRaid: any = {
        id: raidId,
        guildId,
        description: 'Test Raid',
        raidDate: new Date(Date.now() - 1000), // Expired
        status: 'open',
        messageId,
        channelId,
        guild: {
          id: guildId,
          autoArchive: true,
          archiveChannelId: 'archive-123',
          language: 'en',
        },
      };

      // Mock archiveRaid to throw error
      (archiveRaid as jest.Mock<any>).mockRejectedValue(new Error('Archive failed'));

      // Mock raid update
      (prisma.raid.findMany as jest.Mock<any>).mockResolvedValue([mockRaid]);
      (prisma.raid.update as jest.Mock<any>).mockResolvedValue(mockRaid);

      // Mock message fetch and update
      const mockMessage = {
        edit: jest.fn().mockResolvedValue(undefined),
      };

      const mockChannel = {
        isTextBased: () => true,
        messages: {
          fetch: jest.fn().mockResolvedValue(mockMessage),
        },
      };

      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      // Import and run the function
      const { checkAndCloseExpiredRaids } = require('../raidScheduler');
      await checkAndCloseExpiredRaids(mockClient);

      // Verify: Message should be updated despite archive failure
      expect(mockMessage.edit).toHaveBeenCalledWith({
        embeds: expect.any(Array),
        components: [],
      });

      // Verify: archiveRaid was attempted
      expect(archiveRaid).toHaveBeenCalledWith(raidId, guildId, mockClient);

      // Verify: Raid was marked as closed
      expect(prisma.raid.update).toHaveBeenCalledWith({
        where: { id: raidId },
        data: { status: 'closed' },
      });
    });

    it('should NOT update message when archiveRaid() succeeds', async () => {
      const raidId = 'raid-123';
      const guildId = 'guild-123';
      const channelId = 'channel-123';
      const messageId = 'message-123';

      const mockRaid: any = {
        id: raidId,
        guildId,
        description: 'Test Raid',
        raidDate: new Date(Date.now() - 1000), // Expired
        status: 'open',
        messageId,
        channelId,
        guild: {
          id: guildId,
          autoArchive: true,
          archiveChannelId: 'archive-123',
          language: 'en',
        },
      };

      // Mock archiveRaid to succeed
      (archiveRaid as jest.Mock<any>).mockResolvedValue(undefined);

      // Mock raid update
      (prisma.raid.findMany as jest.Mock<any>).mockResolvedValue([mockRaid]);
      (prisma.raid.update as jest.Mock<any>).mockResolvedValue(mockRaid);

      // Mock message fetch
      const mockMessage = {
        edit: jest.fn().mockResolvedValue(undefined),
      };

      const mockChannel = {
        isTextBased: () => true,
        messages: {
          fetch: jest.fn().mockResolvedValue(mockMessage),
        },
      };

      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      // Import and run the function
      const { checkAndCloseExpiredRaids } = require('../raidScheduler');
      await checkAndCloseExpiredRaids(mockClient);

      // Verify: Message should NOT be updated when archive succeeds
      expect(mockMessage.edit).not.toHaveBeenCalled();

      // Verify: archiveRaid was called successfully
      expect(archiveRaid).toHaveBeenCalledWith(raidId, guildId, mockClient);

      // Verify: Raid was marked as closed
      expect(prisma.raid.update).toHaveBeenCalledWith({
        where: { id: raidId },
        data: { status: 'closed' },
      });
    });

    it('should update message when autoArchive is disabled', async () => {
      const raidId = 'raid-123';
      const guildId = 'guild-123';
      const channelId = 'channel-123';
      const messageId = 'message-123';

      const mockRaid: any = {
        id: raidId,
        guildId,
        description: 'Test Raid',
        raidDate: new Date(Date.now() - 1000), // Expired
        status: 'open',
        messageId,
        channelId,
        guild: {
          id: guildId,
          autoArchive: false, // Disabled
          archiveChannelId: null,
          language: 'en',
        },
      };

      // Mock raid update
      (prisma.raid.findMany as jest.Mock<any>).mockResolvedValue([mockRaid]);
      (prisma.raid.update as jest.Mock<any>).mockResolvedValue(mockRaid);

      // Mock message fetch and update
      const mockMessage = {
        edit: jest.fn().mockResolvedValue(undefined),
      };

      const mockChannel = {
        isTextBased: () => true,
        messages: {
          fetch: jest.fn().mockResolvedValue(mockMessage),
        },
      };

      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      // Import and run the function
      const { checkAndCloseExpiredRaids } = require('../raidScheduler');
      await checkAndCloseExpiredRaids(mockClient);

      // Verify: Message should be updated when autoArchive is disabled
      expect(mockMessage.edit).toHaveBeenCalledWith({
        embeds: expect.any(Array),
        components: [],
      });

      // Verify: archiveRaid should NOT be called
      expect(archiveRaid).not.toHaveBeenCalled();
    });
  });

  describe('checkAndCloseExpiredRaids - No expired raids', () => {
    it('should return early if no expired raids', async () => {
      (prisma.raid.findMany as jest.Mock<any>).mockResolvedValue([]);

      const { checkAndCloseExpiredRaids } = require('../raidScheduler');
      await checkAndCloseExpiredRaids(mockClient);

      // Verify: No updates should occur
      expect(prisma.raid.update).not.toHaveBeenCalled();
      expect(archiveRaid).not.toHaveBeenCalled();
    });
  });
});
