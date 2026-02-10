/**
 * Regression test suite for handleCloseRaid() and handleCancelRaid() functions
 * Tests: permission checks, raid lookup, guild isolation, status transitions,
 * embed updates, and already-closed/cancelled edge cases.
 */

import { canManageRaids } from '../../utils/permissions';

jest.mock('../../database/client');
jest.mock('../../utils/permissions');

import prisma from '../../database/client';
import command from '../raid';

function makeRaid(overrides: Record<string, any> = {}) {
  return {
    id: 'raid-123',
    guildId: 'guild-123',
    channelId: 'channel-123',
    description: 'Weekly Raid',
    status: 'open',
    messageId: 'msg-123',
    raidDate: new Date(),
    guild: { language: 'en' },
    attendance: [],
    ...overrides,
  };
}

describe('handleCloseRaid()', () => {
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
        getSubcommand: jest.fn().mockReturnValue('close'),
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
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(
      makeRaid({ guildId: 'other-guild' })
    );
    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('does not belong') })
    );
  });

  it('should reject when raid is already closed', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(
      makeRaid({ status: 'closed' })
    );
    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('already closed') })
    );
  });

  it('should close raid and update embed', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(makeRaid());
    (prisma.raid.update as jest.Mock).mockResolvedValue({});

    await command.execute(mockInteraction);

    expect(prisma.raid.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'raid-123' },
        data: { status: 'closed' },
      })
    );

    // Should update Discord message (remove buttons)
    expect(mockMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        components: [],
      })
    );

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('closed') })
    );
  });

  it('should still close raid when embed update fails', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(makeRaid());
    (prisma.raid.update as jest.Mock).mockResolvedValue({});
    mockChannel.messages.fetch.mockRejectedValue(new Error('Message not found'));

    await command.execute(mockInteraction);

    expect(prisma.raid.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'raid-123' },
        data: { status: 'closed' },
      })
    );
  });
});

describe('handleCancelRaid()', () => {
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
        getSubcommand: jest.fn().mockReturnValue('cancel'),
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
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(
      makeRaid({ guildId: 'other-guild' })
    );
    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('does not belong') })
    );
  });

  it('should reject when raid is already cancelled', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(
      makeRaid({ status: 'cancelled' })
    );
    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('already cancelled') })
    );
  });

  it('should cancel raid and update embed', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(makeRaid());
    (prisma.raid.update as jest.Mock).mockResolvedValue({});

    await command.execute(mockInteraction);

    expect(prisma.raid.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'raid-123' },
        data: { status: 'cancelled' },
      })
    );

    expect(mockMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        components: [],
      })
    );
  });

  it('should still cancel raid when embed update fails', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(makeRaid());
    (prisma.raid.update as jest.Mock).mockResolvedValue({});
    mockChannel.messages.fetch.mockRejectedValue(new Error('Message not found'));

    await command.execute(mockInteraction);

    expect(prisma.raid.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'raid-123' },
        data: { status: 'cancelled' },
      })
    );
  });
});
