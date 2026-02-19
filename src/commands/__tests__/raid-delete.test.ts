/**
 * Regression test suite for handleDeleteRaid() function
 * Tests: permission checks, raid lookup, guild isolation,
 * message deletion, database deletion, and error paths.
 */

import { canManageRaids } from '../../utils/permissions';

jest.mock('../../database/client');
jest.mock('../../utils/permissions');

import prisma from '../../database/client';
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
});
