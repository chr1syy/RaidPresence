/**
 * Regression test suite for config command
 * Tests: view, raid-roles, leader-roles, language, timezone subcommands
 * with permission checks, validation, and database interactions.
 */

jest.mock('../../database/client');

import prisma from '../../database/client';
import command from '../config';

describe('config command', () => {
  let mockInteraction: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockInteraction = {
      guild: { id: 'guild-123', name: 'Test Guild' },
      isChatInputCommand: jest.fn().mockReturnValue(true),
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: jest.fn().mockReturnValue('view'),
        get: jest.fn(() => null),
      },
    };
  });

  describe('command metadata', () => {
    it('should have name "config"', () => {
      expect(command.data.name).toBe('config');
    });

    it('should not execute when not a chat input command', async () => {
      mockInteraction.isChatInputCommand.mockReturnValue(false);
      await command.execute(mockInteraction);
      expect(mockInteraction.deferReply).not.toHaveBeenCalled();
    });
  });

  describe('view subcommand', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand.mockReturnValue('view');
    });

    it('should reject when not in a guild', async () => {
      mockInteraction.guild = null;
      await command.execute(mockInteraction);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('server'), ephemeral: true })
      );
    });

    it('should show error when guild not found in database', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue(null);
      await command.execute(mockInteraction);
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('not found') })
      );
    });

    it('should display current configuration', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'guild-123',
        name: 'Test Guild',
        raidRoles: 'Raider,Trial',
        raidLeaderRoles: 'Officer',
        language: 'en',
        timezoneOffset: 1,
      });

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: 'Server Configuration',
              }),
            }),
          ]),
        })
      );
    });

    it('should show defaults when roles not configured', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'guild-123',
        name: 'Test Guild',
        raidRoles: null,
        raidLeaderRoles: null,
        language: 'en',
        timezoneOffset: 0,
      });

      await command.execute(mockInteraction);
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('should display German language correctly', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'guild-123',
        name: 'Test Guild',
        raidRoles: 'Raider',
        raidLeaderRoles: '',
        language: 'de',
        timezoneOffset: 1,
      });

      await command.execute(mockInteraction);
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('should display negative timezone correctly', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'guild-123',
        name: 'Test Guild',
        raidRoles: 'Raider',
        raidLeaderRoles: '',
        language: 'en',
        timezoneOffset: -5,
      });

      await command.execute(mockInteraction);
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });
  });

  describe('raid-roles subcommand', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand.mockReturnValue('raid-roles');
      mockInteraction.options.get = jest.fn((key: string) => {
        if (key === 'roles') return { value: 'Raider, Trial, Member' };
        return null;
      });
    });

    it('should reject when not in a guild', async () => {
      mockInteraction.guild = null;
      await command.execute(mockInteraction);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true })
      );
    });

    it('should update raid roles in database', async () => {
      (prisma.guild.upsert as jest.Mock).mockResolvedValue({});

      await command.execute(mockInteraction);

      expect(prisma.guild.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'guild-123' },
          update: { raidRoles: 'Raider,Trial,Member' },
        })
      );

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('updated') })
      );
    });

    it('should reject empty roles input', async () => {
      mockInteraction.options.get = jest.fn((key: string) => {
        if (key === 'roles') return { value: ' , , ' };
        return null;
      });

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Invalid roles') })
      );
    });
  });

  describe('leader-roles subcommand', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand.mockReturnValue('leader-roles');
      mockInteraction.options.get = jest.fn((key: string) => {
        if (key === 'roles') return { value: 'Officer,Raid Leader' };
        return null;
      });
    });

    it('should reject when not in a guild', async () => {
      mockInteraction.guild = null;
      await command.execute(mockInteraction);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true })
      );
    });

    it('should update leader roles in database', async () => {
      (prisma.guild.upsert as jest.Mock).mockResolvedValue({});

      await command.execute(mockInteraction);

      expect(prisma.guild.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'guild-123' },
          update: { raidLeaderRoles: 'Officer,Raid Leader' },
        })
      );

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('updated') })
      );
    });

    it('should reject empty roles input', async () => {
      mockInteraction.options.get = jest.fn((key: string) => {
        if (key === 'roles') return { value: '  ' };
        return null;
      });

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Invalid roles') })
      );
    });
  });

  describe('language subcommand', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand.mockReturnValue('language');
    });

    it('should reject when not in a guild', async () => {
      mockInteraction.guild = null;
      await command.execute(mockInteraction);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true })
      );
    });

    it('should set English language', async () => {
      mockInteraction.options.get = jest.fn((key: string) => {
        if (key === 'lang') return { value: 'en' };
        return null;
      });
      (prisma.guild.upsert as jest.Mock).mockResolvedValue({});

      await command.execute(mockInteraction);

      expect(prisma.guild.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { language: 'en' },
        })
      );
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('English') })
      );
    });

    it('should set German language', async () => {
      mockInteraction.options.get = jest.fn((key: string) => {
        if (key === 'lang') return { value: 'de' };
        return null;
      });
      (prisma.guild.upsert as jest.Mock).mockResolvedValue({});

      await command.execute(mockInteraction);

      expect(prisma.guild.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { language: 'de' },
        })
      );
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Deutsch') })
      );
    });

    it('should reject invalid language', async () => {
      mockInteraction.options.get = jest.fn((key: string) => {
        if (key === 'lang') return { value: 'fr' };
        return null;
      });

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Invalid language') })
      );
    });
  });

  describe('timezone subcommand', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand.mockReturnValue('timezone');
    });

    it('should reject when not in a guild', async () => {
      mockInteraction.guild = null;
      await command.execute(mockInteraction);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true })
      );
    });

    it('should set positive timezone offset', async () => {
      mockInteraction.options.get = jest.fn((key: string) => {
        if (key === 'offset') return { value: 2 };
        return null;
      });
      (prisma.guild.upsert as jest.Mock).mockResolvedValue({});

      await command.execute(mockInteraction);

      expect(prisma.guild.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { timezoneOffset: 2 },
        })
      );
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('GMT+2') })
      );
    });

    it('should set negative timezone offset', async () => {
      mockInteraction.options.get = jest.fn((key: string) => {
        if (key === 'offset') return { value: -5 };
        return null;
      });
      (prisma.guild.upsert as jest.Mock).mockResolvedValue({});

      await command.execute(mockInteraction);

      expect(prisma.guild.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { timezoneOffset: -5 },
        })
      );
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('GMT-5') })
      );
    });

    it('should reject timezone below -12', async () => {
      mockInteraction.options.get = jest.fn((key: string) => {
        if (key === 'offset') return { value: -13 };
        return null;
      });

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Invalid timezone') })
      );
    });

    it('should reject timezone above 14', async () => {
      mockInteraction.options.get = jest.fn((key: string) => {
        if (key === 'offset') return { value: 15 };
        return null;
      });

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Invalid timezone') })
      );
    });
  });
});
