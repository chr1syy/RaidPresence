/**
 * Regression test suite for handleListRaids() function
 * Tests: listing upcoming raids, empty list, embed formatting, guild isolation.
 */

// Mock dependencies before imports that use them
jest.mock('../../database/client');
jest.mock('../../utils/permissions');

import prisma from '../../database/client';
import command from '../raid';

describe('handleListRaids()', () => {
  let mockInteraction: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockInteraction = {
      guild: { id: 'guild-123', name: 'Test Guild' },
      channel: { id: 'channel-123' },
      member: { user: { id: 'user-123' } },
      isChatInputCommand: jest.fn().mockReturnValue(true),
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: jest.fn().mockReturnValue('list'),
        // No `team` option supplied → default team
        get: jest.fn().mockReturnValue(undefined),
      },
    };

    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ language: 'en' });
    (prisma.team.findFirst as jest.Mock).mockResolvedValue({
      id: 'team-default',
      guildId: 'guild-123',
      name: 'Main',
      isDefault: true,
      createdBy: 'system',
    });
    (prisma.team.count as jest.Mock).mockResolvedValue(1);
  });

  it('should reject when not in a guild', async () => {
    mockInteraction.guild = null;
    await command.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('server'), ephemeral: true })
    );
  });

  it('should show message when no upcoming raids', async () => {
    (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);
    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('No upcoming raids') })
    );
  });

  it('should display upcoming raids with attendance counts', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    (prisma.raid.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'raid-1',
        guildId: 'guild-123',
        description: 'Heroic Raid',
        raidDate: futureDate,
        attendance: [
          { status: 'attending', userId: 'u1' },
          { status: 'attending', userId: 'u2' },
          { status: 'opted_out', userId: 'u3' },
        ],
      },
      {
        id: 'raid-2',
        guildId: 'guild-123',
        description: 'Mythic Raid',
        raidDate: new Date(futureDate.getTime() + 86400000),
        attendance: [
          { status: 'attending', userId: 'u1' },
        ],
      },
    ]);

    await command.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Upcoming Raids',
            }),
          }),
        ]),
      })
    );
  });

  it('should query only future raids for the correct guild', async () => {
    (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);
    await command.execute(mockInteraction);

    expect(prisma.raid.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          guildId: 'guild-123',
          raidDate: expect.objectContaining({ gte: expect.any(Date) }),
        }),
        orderBy: { raidDate: 'asc' },
      })
    );
  });

  describe('team option', () => {
    /** Makes `options.get('team')` return the given value. */
    function withTeamOption(team: string | undefined) {
      mockInteraction.options.get = jest.fn((name: string) =>
        name === 'team' && team !== undefined ? { value: team } : undefined
      );
    }

    it('should scope the query to the default team when no team option is given', async () => {
      (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);
      await command.execute(mockInteraction);

      expect(prisma.raid.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ teamId: 'team-default' }),
        })
      );
    });

    it('should scope the query to the named team when the team option is given', async () => {
      withTeamOption('Alts');
      (prisma.team.findFirst as jest.Mock).mockResolvedValue({
        id: 'team-alts',
        guildId: 'guild-123',
        name: 'Alts',
        isDefault: false,
        createdBy: 'user-123',
      });
      (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);

      await command.execute(mockInteraction);

      expect(prisma.raid.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ teamId: 'team-alts' }),
        })
      );
    });

    it('should reject an unknown team without querying raids', async () => {
      withTeamOption('Ghosts');
      (prisma.team.findFirst as jest.Mock).mockResolvedValue(null);

      await command.execute(mockInteraction);

      expect(prisma.raid.findMany).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Ghosts') })
      );
    });

    it('should name the team in the title once the guild has multiple teams', async () => {
      (prisma.team.count as jest.Mock).mockResolvedValue(2);
      (prisma.raid.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'raid-1',
          guildId: 'guild-123',
          teamId: 'team-default',
          description: 'Heroic Raid',
          raidDate: new Date(Date.now() + 86400000),
          attendance: [],
        },
      ]);

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({ title: 'Upcoming Raids — Main' }),
            }),
          ]),
        })
      );
    });
  });
});
