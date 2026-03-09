/**
 * Integration Tests for Auto-Archive Failure Fallback (PR#4 Task 3)
 *
 * These tests exercise the full pipeline of the raid scheduler's auto-archive mechanism:
 *   checkAndCloseExpiredRaids() → archiveRaid() → message update fallback
 *
 * Only Prisma is mocked to avoid DB I/O; archiveRaid and message updates run realistically.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies BEFORE imports
jest.mock('../../../database/client', () => ({
  __esModule: true,
  default: { raid: { findMany: jest.fn(), update: jest.fn() } },
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}));
jest.mock('../../archiveManager');
jest.mock('../../../commands/raid', () => ({
  createRaidEmbed: jest.fn(),
}));

// Now safe to import mocked modules
const prisma = require('../../../database/client').default;
const { archiveRaid } = require('../../archiveManager');
const { createRaidEmbed } = require('../../../commands/raid');
const { checkAndCloseExpiredRaids } = require('../../raidScheduler');

describe('Auto-Archive Scheduler Integration Tests', () => {
  let mockClient: any;
  let logSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock Discord client
    mockClient = {
      channels: {
        fetch: jest.fn(),
      },
    };

    // Suppress console logs during tests
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Setup Prisma mocks
    (prisma as any).raid = {
      findMany: jest.fn(),
      update: jest.fn(),
    };

    // Setup createRaidEmbed mock
    (createRaidEmbed as jest.Mock<any>).mockResolvedValue({
      title: 'Closed Raid',
      description: 'Raid has been closed',
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('Full scenario: Archive fails with invalid channel, message update succeeds', () => {
    it('should successfully clean up message when archive channel is invalid', async () => {
      const raidId = 'raid-int-001';
      const guildId = 'guild-001';
      const channelId = 'channel-001';
      const messageId = 'message-001';

      const mockRaid: any = {
        id: raidId,
        guildId,
        description: 'Guild Wars 2 - T4 Fractals',
        raidDate: new Date(Date.now() - 60000), // Expired 1 minute ago
        status: 'open',
        messageId,
        channelId,
        guild: {
          id: guildId,
          autoArchive: true,
          archiveChannelId: 'invalid-archive-channel-id', // Invalid channel that will fail
          language: 'en',
        },
      };

      // Mock archiveRaid to throw error (simulating invalid channel)
      (archiveRaid as jest.Mock<any>).mockRejectedValueOnce(
        new Error('Failed to fetch archive channel: Unknown Channel')
      );

      // Mock raid lookups and update
      (prisma.raid.findMany as jest.Mock<any>).mockResolvedValueOnce([mockRaid]);
      (prisma.raid.update as jest.Mock<any>).mockResolvedValueOnce({
        ...mockRaid,
        status: 'closed',
      });

      // Mock Discord message and channel
      const mockMessage = {
        edit: jest.fn().mockResolvedValueOnce({
          embeds: [{ title: 'Closed Raid' }],
          components: [],
        }),
      };

      const mockChannel = {
        isTextBased: () => true,
        messages: {
          fetch: jest.fn().mockResolvedValueOnce(mockMessage),
        },
      };

      mockClient.channels.fetch.mockResolvedValueOnce(mockChannel);

      // Execute the scheduler function
      await checkAndCloseExpiredRaids(mockClient);

      // VERIFY: Raid was marked as closed in database
      expect(prisma.raid.update).toHaveBeenCalledWith({
        where: { id: raidId },
        data: { status: 'closed' },
      });

      // VERIFY: Archive was attempted (even though it will fail)
      expect(archiveRaid).toHaveBeenCalledWith(raidId, guildId, mockClient);

      // VERIFY: Message was fetched from the original channel
      expect(mockClient.channels.fetch).toHaveBeenCalledWith(channelId);
      expect(mockChannel.messages.fetch).toHaveBeenCalledWith(messageId);

      // VERIFY: Message was updated with closed status and buttons removed
      expect(mockMessage.edit).toHaveBeenCalledWith({
        embeds: expect.any(Array),
        components: [],
      });

      // VERIFY: Error was logged but didn't crash
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to auto-archive'),
        expect.any(Error)
      );
    });
  });

  describe('Full scenario: Archive succeeds, message is NOT updated', () => {
    it('should skip message update when archive succeeds', async () => {
      const raidId = 'raid-int-002';
      const guildId = 'guild-001';
      const channelId = 'channel-001';
      const messageId = 'message-002';

      const mockRaid: any = {
        id: raidId,
        guildId,
        description: 'Mythic Raid - Full Clear',
        raidDate: new Date(Date.now() - 120000), // Expired 2 minutes ago
        status: 'open',
        messageId,
        channelId,
        guild: {
          id: guildId,
          autoArchive: true,
          archiveChannelId: 'valid-archive-channel',
          language: 'en',
        },
      };

      // Mock successful archive
      (archiveRaid as jest.Mock<any>).mockResolvedValueOnce(undefined);

      // Mock raid lookups and update
      (prisma.raid.findMany as jest.Mock<any>).mockResolvedValueOnce([mockRaid]);
      (prisma.raid.update as jest.Mock<any>).mockResolvedValueOnce({
        ...mockRaid,
        status: 'closed',
      });

      // Mock Discord message and channel (should NOT be called)
      const mockMessage = {
        edit: jest.fn(),
      };

      const mockChannel = {
        isTextBased: () => true,
        messages: {
          fetch: jest.fn().mockResolvedValueOnce(mockMessage),
        },
      };

      mockClient.channels.fetch.mockResolvedValueOnce(mockChannel);

      // Execute the scheduler function
      await checkAndCloseExpiredRaids(mockClient);

      // VERIFY: Raid was marked as closed in database
      expect(prisma.raid.update).toHaveBeenCalledWith({
        where: { id: raidId },
        data: { status: 'closed' },
      });

      // VERIFY: Archive was called and succeeded
      expect(archiveRaid).toHaveBeenCalledWith(raidId, guildId, mockClient);

      // VERIFY: Message was NOT fetched (because archive succeeded)
      expect(mockClient.channels.fetch).not.toHaveBeenCalled();

      // VERIFY: Message was NOT edited (because archive succeeded)
      expect(mockMessage.edit).not.toHaveBeenCalled();

      // VERIFY: Success was logged
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Auto-archived')
      );
    });
  });

  describe('Full scenario: Multiple raids with mixed outcomes', () => {
    it('should handle multiple raids with different archive outcomes', async () => {
      const raid1 = {
        id: 'raid-multi-001',
        guildId: 'guild-001',
        description: 'Raid 1 - Will archive successfully',
        raidDate: new Date(Date.now() - 60000),
        status: 'open',
        messageId: 'msg-001',
        channelId: 'ch-001',
        guild: {
          id: 'guild-001',
          autoArchive: true,
          archiveChannelId: 'archive-ch',
          language: 'en',
        },
      };

      const raid2 = {
        id: 'raid-multi-002',
        guildId: 'guild-001',
        description: 'Raid 2 - Archive will fail',
        raidDate: new Date(Date.now() - 120000),
        status: 'open',
        messageId: 'msg-002',
        channelId: 'ch-001',
        guild: {
          id: 'guild-001',
          autoArchive: true,
          archiveChannelId: 'archive-ch-invalid',
          language: 'en',
        },
      };

      // Mock archive calls: first succeeds, second fails
      (archiveRaid as jest.Mock<any>)
        .mockResolvedValueOnce(undefined) // Raid 1 succeeds
        .mockRejectedValueOnce(new Error('Archive channel not found')); // Raid 2 fails

      // Mock raid lookups
      (prisma.raid.findMany as jest.Mock<any>).mockResolvedValueOnce([
        raid1,
        raid2,
      ]);

      // Mock raid updates (called for both raids)
      (prisma.raid.update as jest.Mock<any>)
        .mockResolvedValueOnce({ ...raid1, status: 'closed' })
        .mockResolvedValueOnce({ ...raid2, status: 'closed' });

      // Mock Discord messages
      const mockMessage2 = {
        edit: jest.fn().mockResolvedValueOnce({}),
      };

      const mockChannel = {
        isTextBased: () => true,
        messages: {
          fetch: jest.fn().mockResolvedValueOnce(mockMessage2),
        },
      };

      mockClient.channels.fetch.mockResolvedValueOnce(mockChannel);

      // Execute the scheduler function
      await checkAndCloseExpiredRaids(mockClient);

      // VERIFY: Both raids were marked as closed
      expect(prisma.raid.update).toHaveBeenCalledTimes(2);
      expect(prisma.raid.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'raid-multi-001' },
        data: { status: 'closed' },
      });
      expect(prisma.raid.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'raid-multi-002' },
        data: { status: 'closed' },
      });

      // VERIFY: Archive was attempted for both
      expect(archiveRaid).toHaveBeenCalledTimes(2);

      // VERIFY: Message update was only called for raid 2 (failed archive)
      // Raid 1 succeeded so message should NOT be updated
      // Raid 2 failed so message SHOULD be updated
      expect(mockClient.channels.fetch).toHaveBeenCalledTimes(1);
      expect(mockMessage2.edit).toHaveBeenCalledTimes(1);

      // VERIFY: Success log for raid 1
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Auto-archived raid')
      );

      // VERIFY: Failure log for raid 2
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to auto-archive'),
        expect.any(Error)
      );
    });
  });

  describe('Full scenario: Archive disabled, message update always happens', () => {
    it('should update message when auto-archive is disabled in guild config', async () => {
      const raidId = 'raid-int-003';
      const guildId = 'guild-002';
      const channelId = 'channel-002';
      const messageId = 'message-003';

      const mockRaid: any = {
        id: raidId,
        guildId,
        description: 'Standard Raid',
        raidDate: new Date(Date.now() - 180000), // Expired 3 minutes ago
        status: 'open',
        messageId,
        channelId,
        guild: {
          id: guildId,
          autoArchive: false, // Archive disabled
          archiveChannelId: null,
          language: 'en',
        },
      };

      // Mock raid lookups and update
      (prisma.raid.findMany as jest.Mock<any>).mockResolvedValueOnce([mockRaid]);
      (prisma.raid.update as jest.Mock<any>).mockResolvedValueOnce({
        ...mockRaid,
        status: 'closed',
      });

      // Mock Discord message and channel
      const mockMessage = {
        edit: jest.fn().mockResolvedValueOnce({}),
      };

      const mockChannel = {
        isTextBased: () => true,
        messages: {
          fetch: jest.fn().mockResolvedValueOnce(mockMessage),
        },
      };

      mockClient.channels.fetch.mockResolvedValueOnce(mockChannel);

      // Execute the scheduler function
      await checkAndCloseExpiredRaids(mockClient);

      // VERIFY: Raid was marked as closed
      expect(prisma.raid.update).toHaveBeenCalledWith({
        where: { id: raidId },
        data: { status: 'closed' },
      });

      // VERIFY: archiveRaid was NOT called (disabled)
      expect(archiveRaid).not.toHaveBeenCalled();

      // VERIFY: Message WAS updated (because archive was disabled)
      expect(mockClient.channels.fetch).toHaveBeenCalledWith(channelId);
      expect(mockChannel.messages.fetch).toHaveBeenCalledWith(messageId);
      expect(mockMessage.edit).toHaveBeenCalledWith({
        embeds: expect.any(Array),
        components: [],
      });

      // VERIFY: Closure was logged
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Auto-closed raid')
      );
    });
  });

  describe('Edge case: Message fetch fails', () => {
    it('should handle gracefully when message fetch fails after archive failure', async () => {
      const raidId = 'raid-int-004';
      const guildId = 'guild-003';
      const channelId = 'channel-003';
      const messageId = 'message-004';

      const mockRaid: any = {
        id: raidId,
        guildId,
        description: 'Raid with Deleted Message',
        raidDate: new Date(Date.now() - 60000),
        status: 'open',
        messageId,
        channelId,
        guild: {
          id: guildId,
          autoArchive: true,
          archiveChannelId: 'archive-ch-invalid',
          language: 'en',
        },
      };

      // Mock archive failure
      (archiveRaid as jest.Mock<any>).mockRejectedValueOnce(
        new Error('Archive failed')
      );

      // Mock raid lookups and update
      (prisma.raid.findMany as jest.Mock<any>).mockResolvedValueOnce([mockRaid]);
      (prisma.raid.update as jest.Mock<any>).mockResolvedValueOnce({
        ...mockRaid,
        status: 'closed',
      });

      // Mock message fetch failure
      const mockChannel = {
        isTextBased: () => true,
        messages: {
          fetch: jest.fn().mockRejectedValueOnce(new Error('Unknown Message')),
        },
      };

      mockClient.channels.fetch.mockResolvedValueOnce(mockChannel);

      // Execute the scheduler function
      await checkAndCloseExpiredRaids(mockClient);

      // VERIFY: Raid was marked as closed (even if message update failed)
      expect(prisma.raid.update).toHaveBeenCalledWith({
        where: { id: raidId },
        data: { status: 'closed' },
      });

      // VERIFY: Archive was attempted
      expect(archiveRaid).toHaveBeenCalledWith(raidId, guildId, mockClient);

      // VERIFY: Message fetch was attempted
      expect(mockChannel.messages.fetch).toHaveBeenCalledWith(messageId);

      // VERIFY: Error was logged but didn't crash the whole scheduler
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error updating message'),
        expect.any(Error)
      );
    });
  });
});
