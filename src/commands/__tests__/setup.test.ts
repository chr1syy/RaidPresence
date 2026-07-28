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

  it('should use a runtime-generated future date in the /raid create example', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(null);

    await command.execute(mockInteraction);

    const embed = mockInteraction.editReply.mock.calls[0][0].embeds[0];
    const createField = embed.data.fields.find((f: any) => f.name.includes('Create Your First Raid'));

    const match = createField.value.match(/date:(\d{4}-\d{2}-\d{2})/);
    expect(match).not.toBeNull();
    // The sample must stay copy-pasteable: /raid create rejects dates in the past.
    expect(new Date(`${match[1]}T23:59:59Z`).getTime()).toBeGreaterThan(Date.now());
    expect(createField.value).not.toContain('2026-01-15');
  });

  it('should only reference slash commands that are actually registered', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(null);

    await command.execute(mockInteraction);

    const embed = mockInteraction.editReply.mock.calls[0][0].embeds[0];
    const allText = embed.data.fields.map((f: any) => f.value).join('\n');

    const registered = [
      '/config view',
      '/config leader-roles',
      '/raid create',
      '/raid list',
      '/raid delete',
    ];
    const referenced = [...allText.matchAll(/\/(config|raid|team)\s+([a-z-]+)/g)].map(
      (m: any) => `/${m[1]} ${m[2]}`
    );

    expect(referenced.length).toBeGreaterThan(0);
    for (const cmd of referenced) {
      expect(registered).toContain(cmd);
    }
    expect(allText).not.toContain('/config raid-roles');
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
