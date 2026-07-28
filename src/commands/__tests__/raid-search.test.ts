/**
 * Regression test suite for the archive-related raid subcommands
 * (`search`, `archive`, `unarchive`) with multi-team support.
 *
 * Focus: the command layer passes the resolved team down to the archive helpers and
 * names the team in its answers only when the guild actually has more than one.
 */

jest.mock('../../database/client');
jest.mock('../../utils/permissions');
jest.mock('../../middleware/premiumGate', () => ({
  gateFeature: jest.fn().mockResolvedValue(true),
  freeTierHint: jest.fn().mockResolvedValue(''),
}));
jest.mock('../../utils/archiveManager', () => ({
  archiveRaid: jest.fn().mockResolvedValue('archive-message-1'),
  unarchiveRaid: jest.fn().mockResolvedValue(undefined),
  searchArchive: jest.fn().mockResolvedValue([]),
}));

import prisma from '../../database/client';
import { canManageRaids } from '../../utils/permissions';
import { archiveRaid, searchArchive, unarchiveRaid } from '../../utils/archiveManager';
import command from '../raid';

describe('archive subcommands with team context', () => {
  let mockInteraction: any;

  /** Makes `options.get(name)` answer the given option values. */
  function withOptions(values: Record<string, string>) {
    mockInteraction.options.get = jest.fn((name: string) =>
      name in values ? { value: values[name] } : undefined
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();

    mockInteraction = {
      guild: { id: 'guild-123', name: 'Test Guild' },
      channel: { id: 'channel-123' },
      member: { user: { id: 'user-123' } },
      client: {},
      isChatInputCommand: jest.fn().mockReturnValue(true),
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: jest.fn().mockReturnValue('search'),
        get: jest.fn().mockReturnValue(undefined),
      },
    };

    (canManageRaids as jest.Mock).mockResolvedValue(true);
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ id: 'guild-123', language: 'en' });
    (prisma.team.findFirst as jest.Mock).mockResolvedValue({
      id: 'team-default',
      guildId: 'guild-123',
      name: 'Main',
      isDefault: true,
      createdBy: 'system',
    });
    (prisma.team.findUnique as jest.Mock).mockResolvedValue({
      id: 'team-default',
      guildId: 'guild-123',
      name: 'Main',
      isDefault: true,
      createdBy: 'system',
    });
    (prisma.team.count as jest.Mock).mockResolvedValue(1);
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue({
      id: 'raid-1',
      guildId: 'guild-123',
      teamId: 'team-default',
    });
  });

  describe('search', () => {
    beforeEach(() => {
      withOptions({ query: 'Naxx' });
    });

    it('should scope the search to the default team when no team option is given', async () => {
      await command.execute(mockInteraction);

      expect(searchArchive).toHaveBeenCalledWith(
        expect.objectContaining({ guildId: 'guild-123', query: 'Naxx', teamId: 'team-default' })
      );
    });

    it('should scope the search to the named team when the team option is given', async () => {
      withOptions({ query: 'Naxx', team: 'Alts' });
      (prisma.team.findFirst as jest.Mock).mockResolvedValue({
        id: 'team-alts',
        guildId: 'guild-123',
        name: 'Alts',
        isDefault: false,
        createdBy: 'user-123',
      });

      await command.execute(mockInteraction);

      expect(searchArchive).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-alts' })
      );
    });

    it('should reject an unknown team without searching', async () => {
      withOptions({ query: 'Naxx', team: 'Ghosts' });
      (prisma.team.findFirst as jest.Mock).mockResolvedValue(null);

      await command.execute(mockInteraction);

      expect(searchArchive).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Ghosts') })
      );
    });

    it('should name the team in the embed title once the guild has multiple teams', async () => {
      (prisma.team.count as jest.Mock).mockResolvedValue(2);

      await command.execute(mockInteraction);

      const embed = mockInteraction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.title).toContain('— Main');
    });

    it('should keep the original embed title for single-team guilds', async () => {
      await command.execute(mockInteraction);

      const embed = mockInteraction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.title).not.toContain('—');
    });
  });

  describe('archive', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand.mockReturnValue('archive');
      withOptions({ raid_id: 'raid-1' });
    });

    it('should keep the previous wording for single-team guilds', async () => {
      await command.execute(mockInteraction);

      expect(archiveRaid).toHaveBeenCalledWith('raid-1', 'guild-123', mockInteraction.client);
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '✅ Raid archived successfully.',
      });
    });

    it('should name the team for multi-team guilds', async () => {
      (prisma.team.count as jest.Mock).mockResolvedValue(2);

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Team: **Main**') })
      );
    });
  });

  describe('unarchive', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand.mockReturnValue('unarchive');
      withOptions({ raid_id: 'raid-1' });
    });

    it('should keep the previous wording for single-team guilds', async () => {
      await command.execute(mockInteraction);

      expect(unarchiveRaid).toHaveBeenCalledWith('raid-1', 'guild-123', mockInteraction.client);
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '✅ Raid restored successfully.',
      });
    });

    it('should name the team for multi-team guilds', async () => {
      (prisma.team.count as jest.Mock).mockResolvedValue(2);

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Team: **Main**') })
      );
    });
  });
});
