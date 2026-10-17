/**
 * Regression test suite for handleDeleteRaid() function
 * Tests: permission checks, raid lookup, guild isolation,
 * message deletion, database deletion, and error paths.
 */

import { canManageRaids } from '../../utils/permissions';

jest.mock('../../database/client');
jest.mock('../../utils/permissions');

import prisma, { withRetry } from '../../database/client';
import * as recurringService from '../../services/recurringRaidService';
import { processRecurringSeries } from '../../utils/raidScheduler';
import command from '../raid';

describe('handleDeleteRaid()', () => {
  let mockInteraction: any;
  let mockChannel: any;
  let mockMessage: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMessage = {
      delete: jest.fn().mockResolvedValue(undefined),
    };

    mockChannel = {
      id: 'channel-123',
      isTextBased: jest.fn().mockReturnValue(true),
      messages: {
        fetch: jest.fn().mockResolvedValue(mockMessage),
      },
    };

    mockInteraction = {
      guild: { id: 'guild-123', name: 'Test Guild' },
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
        getSubcommand: jest.fn().mockReturnValue('delete'),
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
      description: 'Other Guild Raid',
    });
    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('does not belong') })
    );
  });

  it('should delete raid and its Discord message', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue({
      id: 'raid-123',
      guildId: 'guild-123',
      description: 'Weekly Raid',
      messageId: 'msg-123',
      channelId: 'channel-123',
      guild: { language: 'en' },
    });
    (prisma.raid.delete as jest.Mock).mockResolvedValue({});

    await command.execute(mockInteraction);

    // Should delete Discord message
    expect(mockMessage.delete).toHaveBeenCalled();

    // Should delete from database
    expect(prisma.raid.delete).toHaveBeenCalledWith({ where: { id: 'raid-123' } });

    // Should confirm success
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('deleted') })
    );
  });

  it('should still delete from DB when Discord message deletion fails', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue({
      id: 'raid-123',
      guildId: 'guild-123',
      description: 'Weekly Raid',
      messageId: 'msg-123',
      channelId: 'channel-123',
      guild: { language: 'en' },
    });
    mockChannel.messages.fetch.mockRejectedValue(new Error('Message not found'));
    (prisma.raid.delete as jest.Mock).mockResolvedValue({});

    await command.execute(mockInteraction);

    // Should still delete from database
    expect(prisma.raid.delete).toHaveBeenCalledWith({ where: { id: 'raid-123' } });
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('deleted') })
    );
  });

  it('should name the raid team on multi-team guilds', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue({
      id: 'raid-123',
      guildId: 'guild-123',
      teamId: 'team-alts',
      description: 'Weekly Raid',
      messageId: null,
      channelId: null,
      guild: { language: 'en' },
    });
    (prisma.raid.delete as jest.Mock).mockResolvedValue({});
    (prisma.team.count as jest.Mock).mockResolvedValue(2);
    (prisma.team.findUnique as jest.Mock).mockResolvedValue({ id: 'team-alts', name: 'Alts' });

    await command.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Team: **Alts**') })
    );
  });

  it('should not mention a team on single-team guilds', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue({
      id: 'raid-123',
      guildId: 'guild-123',
      teamId: 'team-default',
      description: 'Weekly Raid',
      messageId: null,
      channelId: null,
      guild: { language: 'en' },
    });
    (prisma.raid.delete as jest.Mock).mockResolvedValue({});
    (prisma.team.count as jest.Mock).mockResolvedValue(1);

    await command.execute(mockInteraction);

    const { content } = (mockInteraction.editReply as jest.Mock).mock.calls[0][0];
    expect(content).not.toContain('Team:');
    // Single-team guilds must not even pay for the team lookup.
    expect(prisma.team.findUnique).not.toHaveBeenCalled();
  });

  it('should handle raid without messageId gracefully', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue({
      id: 'raid-123',
      guildId: 'guild-123',
      description: 'Weekly Raid',
      messageId: null,
      channelId: null,
      guild: { language: 'en' },
    });
    (prisma.raid.delete as jest.Mock).mockResolvedValue({});

    await command.execute(mockInteraction);

    expect(mockMessage.delete).not.toHaveBeenCalled();
    expect(prisma.raid.delete).toHaveBeenCalledWith({ where: { id: 'raid-123' } });
  });

  it('does not recreate a deleted weekly successor on later scheduler ticks', async () => {
    const parent = {
      id: 'raid-parent', guildId: 'guild-123', teamId: 'team-123',
      status: 'closed', recurrenceRule: 'weekly', recurrenceActive: true,
      raidDate: new Date('2026-10-01T18:00:00Z'),
    };
    const child = {
      ...parent, id: 'raid-123', status: 'open', recurrenceParentId: parent.id,
      messageId: null, channelId: null, description: 'Weekly Raid',
    };
    const raids = new Map<string, any>([[parent.id, parent], [child.id, child]]);
    (withRetry as jest.Mock).mockImplementation((run: () => Promise<unknown>) => run());
    (prisma.raid.findUnique as jest.Mock).mockImplementation(async ({ where }: any) => {
      const raid = raids.get(where.id);
      return raid ? { ...raid, guild: { language: 'en' } } : null;
    });
    (prisma.raid.findMany as jest.Mock).mockImplementation(async () =>
      [...raids.values()].filter((raid) =>
        raid.status === 'closed' && raid.recurrenceRule === 'weekly' &&
        raid.recurrenceActive && ![...raids.values()].some((next) => next.recurrenceParentId === raid.id),
      ),
    );
    (prisma.raid.delete as jest.Mock).mockImplementation(async ({ where }: any) => raids.delete(where.id));
    (prisma.raid.updateMany as jest.Mock).mockImplementation(async ({ where, data }: any) => {
      const raid = raids.get(where.id);
      if (!raid || raid.guildId !== where.guildId) return { count: 0 };
      Object.assign(raid, data);
      return { count: 1 };
    });
    const advanceSeries = jest.spyOn(recurringService, 'advanceSeries').mockImplementation(async (_client: any, source: any) => {
      raids.set('raid-reappeared', { ...child, id: 'raid-reappeared', recurrenceParentId: source.id });
      return { ok: true, raidId: 'raid-reappeared', raidDate: new Date(), memberCount: 1 };
    });

    await command.execute(mockInteraction);
    await processRecurringSeries(mockInteraction.client);
    await processRecurringSeries(mockInteraction.client);

    expect(raids.has(child.id)).toBe(false);
    expect(raids.has('raid-reappeared')).toBe(false);
    expect(advanceSeries).not.toHaveBeenCalled();
    advanceSeries.mockRestore();
  });
});
