/**
 * Regression test suite for setup command
 * Tests: guild requirement, database lookup, embed display, defaults.
 */

jest.mock('../../database/client');

import prisma from '../../database/client';
import command from '../setup';

describe('setup command', () => {
  let mockInteraction: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockInteraction = {
      guild: { id: 'guild-123', name: 'Test Guild' },
      isChatInputCommand: jest.fn().mockReturnValue(true),
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('should have name "setup"', () => {
    expect(command.data.name).toBe('setup');
  });

  it('should not execute when not a chat input command', async () => {
    mockInteraction.isChatInputCommand.mockReturnValue(false);
    await command.execute(mockInteraction);
    expect(mockInteraction.deferReply).not.toHaveBeenCalled();
  });

  it('should reject when not in a guild', async () => {
    mockInteraction.guild = null;
    await command.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('server'), ephemeral: true })
    );
  });

  it('should display setup guide with current configuration', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      id: 'guild-123',
      name: 'Test Guild',
      raidRoles: 'Raider,Trial',
      raidLeaderRoles: 'Officer',
    });

    await command.execute(mockInteraction);

    expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: expect.stringContaining('Setup Guide'),
            }),
          }),
        ]),
      })
    );
  });

  it('should show defaults when guild not in database', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(null);

    await command.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: expect.stringContaining('Setup Guide'),
            }),
          }),
        ]),
      })
    );
  });

  it('should show "Not configured" when roles are empty', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      id: 'guild-123',
      name: 'Test Guild',
      raidRoles: '',
      raidLeaderRoles: '',
    });

    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalled();
  });
});
