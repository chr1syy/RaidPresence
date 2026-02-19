/**
 * Regression test suite for handleOpenRaid() function
 * Tests: permission checks, raid lookup, guild isolation, status transitions,
 * embed updates, and validation of closed status requirement.
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
    status: 'closed',
    messageId: 'msg-123',
    raidDate: new Date(),
    guild: { language: 'en', raidRoles: ['role-123'] },
    attendance: [],
    ...overrides,
  };
}

describe('handleOpenRaid()', () => {
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
        getSubcommand: jest.fn().mockReturnValue('open'),
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

  it('should reject when raid is not closed', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(
      makeRaid({ status: 'open' })
    );
    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('not closed') })
    );
  });

  it('should reject when raid is cancelled', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(
      makeRaid({ status: 'cancelled' })
    );
    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('not closed') })
    );
  });

  it('should open raid and restore buttons', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(makeRaid());
    (prisma.raid.update as jest.Mock).mockResolvedValue({});

    await command.execute(mockInteraction);

    expect(prisma.raid.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'raid-123' },
        data: { status: 'open' },
      })
    );

    // Should update Discord message with buttons restored
    expect(mockMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
      })
    );

    // Should have 2 rows of buttons
    const editCall = mockMessage.edit.mock.calls[0][0];
    expect(editCall.components.length).toBe(2);

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('opened') })
    );
  });

  it('should still open raid when embed update fails', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(makeRaid());
    (prisma.raid.update as jest.Mock).mockResolvedValue({});
    mockChannel.messages.fetch.mockRejectedValue(new Error('Message not found'));

    await command.execute(mockInteraction);

    expect(prisma.raid.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'raid-123' },
        data: { status: 'open' },
      })
    );

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('opened') })
    );
  });
});
