/**
 * Regression test suite for the /team command.
 * Tests: create (validation + premium gating + duplicates), list (rendering,
 * default badge, free-tier hint) and delete (not-found, default-team, cascade).
 */

jest.mock('../../database/client');
jest.mock('../../services/teamService');
jest.mock('../../services/entitlementService');
jest.mock('../../middleware/premiumGate');

import prisma from '../../database/client';
import command from '../team';
import {
  countTeams,
  createTeam,
  deleteTeam,
  getTeamByName,
  listTeams,
  DuplicateTeamNameError,
} from '../../services/teamService';
import { canCreateAdditionalTeam, getTier } from '../../services/entitlementService';
import { gateFeature, freeTierHint } from '../../middleware/premiumGate';

const team = (overrides: Record<string, unknown> = {}) => ({
  id: 'team-1',
  guildId: 'guild-123',
  name: 'Alpha',
  isDefault: false,
  createdBy: 'user-1',
  ...overrides,
});

describe('team command', () => {
  let mockInteraction: any;

  beforeEach(() => {
    jest.clearAllMocks();

    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ language: 'en' });
    (prisma.raid.count as jest.Mock).mockResolvedValue(0);
    (canCreateAdditionalTeam as jest.Mock).mockResolvedValue(true);
    (getTier as jest.Mock).mockResolvedValue('PREMIUM');
    (gateFeature as jest.Mock).mockResolvedValue(false);
    (freeTierHint as jest.Mock).mockResolvedValue('');

    mockInteraction = {
      guild: { id: 'guild-123', name: 'Test Guild' },
      guildId: 'guild-123',
      user: { id: 'user-1' },
      isChatInputCommand: jest.fn().mockReturnValue(true),
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: jest.fn().mockReturnValue('list'),
        getString: jest.fn(() => null),
      },
    };
  });

  describe('command metadata', () => {
    it('should have name "team"', () => {
      expect(command.data.name).toBe('team');
    });

    it('should expose create, list and delete subcommands', () => {
      const json = command.data.toJSON() as any;
      expect(json.options.map((o: any) => o.name).sort()).toEqual(['create', 'delete', 'list']);
    });

    it('should not execute when not a chat input command', async () => {
      mockInteraction.isChatInputCommand.mockReturnValue(false);
      await command.execute(mockInteraction);
      expect(mockInteraction.deferReply).not.toHaveBeenCalled();
    });
  });

  describe('create subcommand', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand.mockReturnValue('create');
      mockInteraction.options.getString.mockReturnValue('Alpha');
      (countTeams as jest.Mock).mockResolvedValue(1);
      (createTeam as jest.Mock).mockResolvedValue(team());
    });

    it('should reject when not in a guild', async () => {
      mockInteraction.guild = null;
      await command.execute(mockInteraction);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('server'), ephemeral: true })
      );
      expect(createTeam).not.toHaveBeenCalled();
    });

    it('should reject whitespace-only names without touching the service', async () => {
      mockInteraction.options.getString.mockReturnValue('   ');
      await command.execute(mockInteraction);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('valid team name'), ephemeral: true })
      );
      expect(createTeam).not.toHaveBeenCalled();
    });

    it('should reject names longer than 50 characters', async () => {
      mockInteraction.options.getString.mockReturnValue('x'.repeat(51));
      await command.execute(mockInteraction);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('valid team name'), ephemeral: true })
      );
      expect(createTeam).not.toHaveBeenCalled();
    });

    it('should gate the second team on the free tier and not create it', async () => {
      (canCreateAdditionalTeam as jest.Mock).mockResolvedValue(false);

      await command.execute(mockInteraction);

      expect(canCreateAdditionalTeam).toHaveBeenCalledWith('guild-123', 1);
      expect(gateFeature).toHaveBeenCalledWith(mockInteraction, 'team.multi', 'en');
      expect(createTeam).not.toHaveBeenCalled();
      expect(mockInteraction.deferReply).not.toHaveBeenCalled();
    });

    it('should create the team when allowed and confirm ephemerally', async () => {
      await command.execute(mockInteraction);

      expect(createTeam).toHaveBeenCalledWith('guild-123', 'Alpha', 'user-1');
      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('**Alpha**') })
      );
    });

    it('should trim the name before creating', async () => {
      mockInteraction.options.getString.mockReturnValue('  Alpha  ');
      await command.execute(mockInteraction);
      expect(createTeam).toHaveBeenCalledWith('guild-123', 'Alpha', 'user-1');
    });

    it('should report duplicate names instead of throwing', async () => {
      (createTeam as jest.Mock).mockRejectedValue(new DuplicateTeamNameError('guild-123', 'Alpha'));

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('already exists') })
      );
    });

    it('should use the guild language for responses', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ language: 'de' });

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('erstellt') })
      );
    });
  });

  describe('list subcommand', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand.mockReturnValue('list');
    });

    it('should render each team with its raid count and mark the default team', async () => {
      (listTeams as jest.Mock).mockResolvedValue([
        team({ id: 'team-default', name: 'Main', isDefault: true }),
        team({ id: 'team-1', name: 'Alpha' }),
      ]);
      (prisma.raid.count as jest.Mock).mockResolvedValue(3);

      await command.execute(mockInteraction);

      const description = mockInteraction.editReply.mock.calls[0][0].embeds[0].data.description;
      expect(description).toContain('**Main**');
      expect(description).toContain('3 raids');
      expect(description).toContain('default');
      expect(description).toContain('**Alpha**');
      expect(prisma.raid.count).toHaveBeenCalledWith({ where: { teamId: 'team-default' } });
    });

    it('should show the empty state when the guild has no teams', async () => {
      (listTeams as jest.Mock).mockResolvedValue([]);

      await command.execute(mockInteraction);

      const description = mockInteraction.editReply.mock.calls[0][0].embeds[0].data.description;
      expect(description).toBe('No teams yet.');
    });

    it('should append the premium hint for free guilds', async () => {
      (listTeams as jest.Mock).mockResolvedValue([team({ isDefault: true, name: 'Main' })]);
      (freeTierHint as jest.Mock).mockResolvedValue('\n-# upgrade hint');

      await command.execute(mockInteraction);

      expect(freeTierHint).toHaveBeenCalledWith('guild-123', 'en');
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '\n-# upgrade hint' })
      );
    });

    it('should not append the premium hint for premium guilds', async () => {
      (listTeams as jest.Mock).mockResolvedValue([team({ isDefault: true, name: 'Main' })]);
      (freeTierHint as jest.Mock).mockResolvedValue('');

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply.mock.calls[0][0].content).toBeUndefined();
    });
  });

  describe('delete subcommand', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand.mockReturnValue('delete');
      mockInteraction.options.getString.mockReturnValue('Alpha');
    });

    it('should report unknown teams', async () => {
      (getTeamByName as jest.Mock).mockResolvedValue(null);

      await command.execute(mockInteraction);

      expect(deleteTeam).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('No team named') })
      );
    });

    it('should refuse to delete the default team', async () => {
      (getTeamByName as jest.Mock).mockResolvedValue(team({ isDefault: true, name: 'Main' }));

      await command.execute(mockInteraction);

      expect(deleteTeam).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('default team cannot be deleted') })
      );
    });

    it('should delete the team and warn about cascaded raids', async () => {
      (getTeamByName as jest.Mock).mockResolvedValue(team());
      (deleteTeam as jest.Mock).mockResolvedValue(undefined);

      await command.execute(mockInteraction);

      expect(deleteTeam).toHaveBeenCalledWith('team-1');
      const content = mockInteraction.editReply.mock.calls[0][0].content;
      expect(content).toContain('**Alpha**');
      expect(content).toContain('All raids of this team were deleted as well.');
    });

    it('should use the German cascade note for German guilds', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ language: 'de' });
      (getTeamByName as jest.Mock).mockResolvedValue(team());

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply.mock.calls[0][0].content).toContain(
        'Alle Raids dieses Teams wurden ebenfalls gelöscht.'
      );
    });
  });
});
