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
jest.mock('../teamContext', () => ({
  getTeamLabel: jest.fn(),
}));
// Only the DB-backed tier lookup is faked; hasFeature/FEATURE_TIERS stay real so these
// tests break if `raid.archive` ever changes tier.
jest.mock('../../services/entitlementService', () => ({
  ...jest.requireActual('../../services/entitlementService'),
  getTier: jest.fn(),
}));

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import prisma from '../../database/client';
import { archiveRaid } from '../archiveManager';
import { createRaidEmbed } from '../../commands/raid';
import { getTeamLabel } from '../teamContext';
import { getTier } from '../../services/entitlementService';

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

    // Default: single-team guild -> no team is named anywhere
    (getTeamLabel as jest.Mock<any>).mockResolvedValue(null);

    // Default: entitled guild, so the pre-existing auto-archive cases behave as before.
    (getTier as jest.Mock<any>).mockResolvedValue('PREMIUM');
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

  describe('checkAndCloseExpiredRaids - Premium gate on auto-archive', () => {
    const raidId = 'raid-gate';
    const guildId = 'guild-gate';

    /** Guild with auto-archive fully configured — the only variable is the tier. */
    const makeArchivableRaid = (): any => ({
      id: raidId,
      guildId,
      description: 'Test Raid',
      raidDate: new Date(Date.now() - 1000),
      status: 'open',
      messageId: 'message-gate',
      channelId: 'channel-gate',
      guild: {
        id: guildId,
        autoArchive: true,
        archiveChannelId: 'archive-gate',
        language: 'en',
      },
    });

    let mockMessage: any;

    beforeEach(() => {
      (prisma.raid.findMany as jest.Mock<any>).mockResolvedValue([makeArchivableRaid()]);
      (prisma.raid.update as jest.Mock<any>).mockResolvedValue(makeArchivableRaid());
      (archiveRaid as jest.Mock<any>).mockResolvedValue(undefined);

      mockMessage = { edit: jest.fn().mockResolvedValue(undefined) };
      mockClient.channels.fetch.mockResolvedValue({
        isTextBased: () => true,
        messages: { fetch: jest.fn().mockResolvedValue(mockMessage) },
        send: jest.fn().mockResolvedValue(undefined),
      });
    });

    it('archives the raid when the guild has premium', async () => {
      (getTier as jest.Mock<any>).mockResolvedValue('PREMIUM');

      const { checkAndCloseExpiredRaids } = require('../raidScheduler');
      await checkAndCloseExpiredRaids(mockClient);

      expect(archiveRaid).toHaveBeenCalledWith(raidId, guildId, mockClient);
      expect(prisma.raid.update).toHaveBeenCalledWith({
        where: { id: raidId },
        data: { status: 'closed' },
      });
    });

    it('does NOT archive the raid when the guild is on the free tier', async () => {
      (getTier as jest.Mock<any>).mockResolvedValue('FREE');

      const { checkAndCloseExpiredRaids } = require('../raidScheduler');
      await checkAndCloseExpiredRaids(mockClient);

      expect(archiveRaid).not.toHaveBeenCalled();

      // The raid still closes — only the archiving is withheld.
      expect(prisma.raid.update).toHaveBeenCalledWith({
        where: { id: raidId },
        data: { status: 'closed' },
      });

      // Falls back to the normal close path: buttons stripped from the original message.
      expect(mockMessage.edit).toHaveBeenCalledWith({
        embeds: expect.any(Array),
        components: [],
      });
    });

    it('skips quietly — no message is sent to the guild and nothing throws', async () => {
      (getTier as jest.Mock<any>).mockResolvedValue('FREE');
      const channel = await mockClient.channels.fetch();

      const { checkAndCloseExpiredRaids } = require('../raidScheduler');
      await expect(checkAndCloseExpiredRaids(mockClient)).resolves.not.toThrow();

      // No upsell/warning spam: a scheduler pass runs every two minutes.
      expect(channel.send).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('fails closed when the tier lookup errors', async () => {
      (getTier as jest.Mock<any>).mockRejectedValue(new Error('db down'));

      const { checkAndCloseExpiredRaids } = require('../raidScheduler');
      await checkAndCloseExpiredRaids(mockClient);

      expect(archiveRaid).not.toHaveBeenCalled();
      expect(prisma.raid.update).toHaveBeenCalledWith({
        where: { id: raidId },
        data: { status: 'closed' },
      });
    });
  });

  describe('checkAndCloseExpiredRaids - Team awareness', () => {
    const raidId = 'raid-team';
    const guildId = 'guild-team';

    const makeExpiredRaid = (overrides: any = {}): any => ({
      id: raidId,
      guildId,
      teamId: 'team-b',
      description: 'Test Raid',
      raidDate: new Date(Date.now() - 1000),
      status: 'open',
      messageId: 'message-123',
      channelId: 'channel-123',
      guild: {
        id: guildId,
        autoArchive: false,
        archiveChannelId: null,
        language: 'en',
      },
      ...overrides,
    });

    const mockChannelWithMessage = () => {
      const mockMessage = { edit: jest.fn().mockResolvedValue(undefined) };
      mockClient.channels.fetch.mockResolvedValue({
        isTextBased: () => true,
        messages: { fetch: jest.fn().mockResolvedValue(mockMessage) },
      });
      return mockMessage;
    };

    const loggedLines = (): string[] =>
      logSpy.mock.calls.map((call: any[]) => String(call[0]));

    it('scans raids across all teams - the query is not team-scoped', async () => {
      (prisma.raid.findMany as jest.Mock<any>).mockResolvedValue([]);

      const { checkAndCloseExpiredRaids } = require('../raidScheduler');
      await checkAndCloseExpiredRaids(mockClient);

      const where = (prisma.raid.findMany as jest.Mock<any>).mock.calls[0][0].where;
      expect(where).not.toHaveProperty('teamId');
      expect(where).toEqual({ status: 'open', raidDate: { lt: expect.any(Date) } });
    });

    it('names the team when closing a raid in a multi-team guild', async () => {
      (getTeamLabel as jest.Mock<any>).mockResolvedValue('Team B');
      (prisma.raid.findMany as jest.Mock<any>).mockResolvedValue([makeExpiredRaid()]);
      (prisma.raid.update as jest.Mock<any>).mockResolvedValue(undefined);
      mockChannelWithMessage();

      const { checkAndCloseExpiredRaids } = require('../raidScheduler');
      await checkAndCloseExpiredRaids(mockClient);

      expect(getTeamLabel).toHaveBeenCalledWith(guildId, 'team-b');
      expect(loggedLines()).toContain(`✅ Auto-closed raid: Test Raid (${raidId}) (Team: Team B)`);
    });

    it('keeps the wording unchanged for a single-team guild', async () => {
      // getTeamLabel returns null for single-team guilds (see teamContext)
      (prisma.raid.findMany as jest.Mock<any>).mockResolvedValue([makeExpiredRaid()]);
      (prisma.raid.update as jest.Mock<any>).mockResolvedValue(undefined);
      mockChannelWithMessage();

      const { checkAndCloseExpiredRaids } = require('../raidScheduler');
      await checkAndCloseExpiredRaids(mockClient);

      expect(loggedLines()).toContain(`✅ Auto-closed raid: Test Raid (${raidId})`);
    });

    it('names the team on the auto-archive path too', async () => {
      (getTeamLabel as jest.Mock<any>).mockResolvedValue('Team B');
      (prisma.raid.findMany as jest.Mock<any>).mockResolvedValue([
        makeExpiredRaid({
          guild: {
            id: guildId,
            autoArchive: true,
            archiveChannelId: 'archive-123',
            language: 'en',
          },
        }),
      ]);
      (prisma.raid.update as jest.Mock<any>).mockResolvedValue(undefined);
      (archiveRaid as jest.Mock<any>).mockResolvedValue(undefined);

      const { checkAndCloseExpiredRaids } = require('../raidScheduler');
      await checkAndCloseExpiredRaids(mockClient);

      const lines = loggedLines();
      expect(lines).toContain(`✅ Auto-archived raid: Test Raid (${raidId}) (Team: Team B)`);
      expect(lines).toContain(
        `✅ Auto-closed and archived raid: Test Raid (${raidId}) (Team: Team B)`
      );
    });

    it('stays silent about teams when the raid has no team yet', async () => {
      (prisma.raid.findMany as jest.Mock<any>).mockResolvedValue([
        makeExpiredRaid({ teamId: null }),
      ]);
      (prisma.raid.update as jest.Mock<any>).mockResolvedValue(undefined);
      mockChannelWithMessage();

      const { checkAndCloseExpiredRaids } = require('../raidScheduler');
      await checkAndCloseExpiredRaids(mockClient);

      expect(getTeamLabel).toHaveBeenCalledWith(guildId, null);
      expect(loggedLines()).toContain(`✅ Auto-closed raid: Test Raid (${raidId})`);
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
