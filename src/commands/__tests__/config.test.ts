/**
 * Regression test suite for config command
 * Tests: view, leader-roles, language, timezone, archive-channel, auto-archive subcommands
 * with permission checks, validation, and database interactions.
 */

jest.mock('../../database/client');
jest.mock('../../middleware/premiumGate', () => ({
  freeTierHint: jest.fn().mockResolvedValue(''),
}));

import prisma from '../../database/client';
import command from '../config';
import { freeTierHint } from '../../middleware/premiumGate';

describe('config command', () => {
  let mockInteraction: any;

  beforeEach(() => {
    jest.clearAllMocks();

    (freeTierHint as jest.Mock).mockResolvedValue('');

    mockInteraction = {
      guild: { id: 'guild-123', name: 'Test Guild' },
      guildId: 'guild-123',
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
        timezone: 'Europe/Berlin',
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

    it('should append the free-tier upsell hint as content', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'guild-123',
        raidLeaderRoles: 'Officer',
        language: 'de',
        timezone: 'Europe/Berlin',
      });
      (freeTierHint as jest.Mock).mockResolvedValue('\n-# upgrade hint');

      await command.execute(mockInteraction);

      expect(freeTierHint).toHaveBeenCalledWith('guild-123', 'de');
      expect(mockInteraction.editReply.mock.calls[0][0].content).toBe('\n-# upgrade hint');
    });

    it('should leave content undefined for premium guilds', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'guild-123',
        raidLeaderRoles: 'Officer',
        language: 'en',
        timezone: 'Europe/Berlin',
      });

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply.mock.calls[0][0].content).toBeUndefined();
    });

    it('should show defaults when roles not configured', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'guild-123',
        name: 'Test Guild',
        raidRoles: null,
        raidLeaderRoles: null,
        language: 'en',
        timezone: 'UTC',
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
        timezone: 'Europe/Berlin',
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
        timezone: 'America/New_York',
      });

      await command.execute(mockInteraction);
      expect(mockInteraction.editReply).toHaveBeenCalled();
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

    const withZone = (zone: unknown) =>
      jest.fn((key: string) => (key === 'zone' ? { value: zone } : null));

    it('should store an east-of-UTC IANA zone', async () => {
      mockInteraction.options.get = withZone('Europe/Berlin');
      (prisma.guild.upsert as jest.Mock).mockResolvedValue({});

      await command.execute(mockInteraction);

      expect(prisma.guild.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { timezone: 'Europe/Berlin', timezoneOffset: expect.any(Number) },
        })
      );
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Europe/Berlin') })
      );
    });

    it('should store a west-of-UTC IANA zone', async () => {
      mockInteraction.options.get = withZone('America/New_York');
      (prisma.guild.upsert as jest.Mock).mockResolvedValue({});

      await command.execute(mockInteraction);

      expect(prisma.guild.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { timezone: 'America/New_York', timezoneOffset: expect.any(Number) },
        })
      );
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('America/New_York') })
      );
    });

    it('should keep the deprecated timezoneOffset column in sync', async () => {
      // Phase 1 of the IANA migration keeps the old integer column as a rollback
      // path, so every write has to fill both. Etc/GMT-3 is UTC+3 (POSIX inversion),
      // and being a fixed-offset zone it is stable regardless of when the suite runs.
      mockInteraction.options.get = withZone('Etc/GMT-3');
      (prisma.guild.upsert as jest.Mock).mockResolvedValue({});

      await command.execute(mockInteraction);

      expect(prisma.guild.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { timezone: 'Etc/GMT-3', timezoneOffset: 3 },
        })
      );
    });

    it('should normalize casing to the canonical identifier', async () => {
      mockInteraction.options.get = withZone('  europe/berlin  ');
      (prisma.guild.upsert as jest.Mock).mockResolvedValue({});

      await command.execute(mockInteraction);

      expect(prisma.guild.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { timezone: 'Europe/Berlin', timezoneOffset: expect.any(Number) },
        })
      );
    });

    // Autocomplete only suggests — Discord still submits whatever was typed, so the
    // handler must reject free text rather than persisting an unusable zone.
    it('should reject an unknown zone without writing to the database', async () => {
      mockInteraction.options.get = withZone('Mordor/Barad-dur');

      await command.execute(mockInteraction);

      expect(prisma.guild.upsert).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('is not a known timezone'),
        })
      );
    });

    it('should reject a legacy numeric offset', async () => {
      mockInteraction.options.get = withZone('2');

      await command.execute(mockInteraction);

      expect(prisma.guild.upsert).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('is not a known timezone'),
        })
      );
    });
  });

  describe('archive-channel subcommand', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand.mockReturnValue('archive-channel');
      mockInteraction.options.getChannel = jest.fn().mockReturnValue({
        id: 'channel-456',
        name: 'archive',
        type: 0, // GuildText
      });
    });

    it('should reject when not in a guild', async () => {
      mockInteraction.guild = null;
      await command.execute(mockInteraction);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true })
      );
    });

    it('should update archive channel in database', async () => {
      (prisma.guild.upsert as jest.Mock).mockResolvedValue({});

      await command.execute(mockInteraction);

      expect(prisma.guild.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'guild-123' },
          update: { archiveChannelId: 'channel-456' },
        })
      );

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Archive channel set') })
      );
    });

    it('should reject non-text channels', async () => {
      mockInteraction.options.getChannel = jest.fn().mockReturnValue({
        id: 'channel-456',
        name: 'voice-channel',
        type: 2, // GuildVoice
      });

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('text channel') })
      );
    });
  });

  describe('auto-archive subcommand', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand.mockReturnValue('auto-archive');
      mockInteraction.options.getBoolean = jest.fn().mockReturnValue(true);
    });

    it('should reject when not in a guild', async () => {
      mockInteraction.guild = null;
      await command.execute(mockInteraction);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true })
      );
    });

    it('should reject auto-archive when archive channel not configured', async () => {
      mockInteraction.options.getBoolean.mockReturnValue(true);
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'guild-123',
        archiveChannelId: null,
      });

      await command.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Archive channel must be configured') })
      );
    });

    it('should enable auto-archive when archive channel is configured', async () => {
      mockInteraction.options.getBoolean.mockReturnValue(true);
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'guild-123',
        archiveChannelId: 'channel-456',
      });
      (prisma.guild.upsert as jest.Mock).mockResolvedValue({});

      await command.execute(mockInteraction);

      expect(prisma.guild.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'guild-123' },
          update: { autoArchive: true },
        })
      );

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('enabled') })
      );
    });

    it('should disable auto-archive', async () => {
      mockInteraction.options.getBoolean.mockReturnValue(false);
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'guild-123',
        archiveChannelId: 'channel-456',
      });
      (prisma.guild.upsert as jest.Mock).mockResolvedValue({});

      await command.execute(mockInteraction);

      expect(prisma.guild.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'guild-123' },
          update: { autoArchive: false },
        })
      );

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('disabled') })
      );
    });
  });
});

