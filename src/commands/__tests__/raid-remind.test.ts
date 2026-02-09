/**
 * Test suite for handleRemindRaid() function
 * Tests: backward compatibility (no custom message), custom message in embed,
 * opted-out list display, message character limit enforcement, and error paths.
 */

import { canManageRaids } from '../../utils/permissions';

// Mock dependencies before imports that use them
jest.mock('../../database/client');
jest.mock('../../utils/permissions');

import prisma from '../../database/client';
import command from '../raid';

/**
 * Minimal Collection-like Map that supports discord.js `.some()` and `.filter()`.
 */
class MockCollection<K, V> extends Map<K, V> {
  some(fn: (value: V, key: K, map: this) => boolean): boolean {
    for (const [key, value] of this) {
      if (fn(value, key, this)) return true;
    }
    return false;
  }

  filter(fn: (value: V, key: K, map: this) => boolean): MockCollection<K, V> {
    const result = new MockCollection<K, V>();
    for (const [key, value] of this) {
      if (fn(value, key, this)) result.set(key, value);
    }
    return result;
  }

  find(fn: (value: V, key: K, map: this) => boolean): V | undefined {
    for (const [key, value] of this) {
      if (fn(value, key, this)) return value;
    }
    return undefined;
  }
}

function makeRaid(overrides: Record<string, any> = {}) {
  return {
    id: 'raid-123',
    guildId: 'guild-123',
    channelId: 'channel-123',
    raidDate: new Date('2026-06-15T18:00:00Z'),
    description: 'Sunday Raid Night',
    roles: 'role-raider',
    status: 'open',
    createdBy: 'user-leader',
    messageId: 'msg-123',
    guild: {
      id: 'guild-123',
      language: 'en',
      timezoneOffset: 0,
      raidLeaderRoles: 'role-leader',
      raidRoles: 'role-raider',
    },
    attendance: [
      {
        id: 'att-1',
        userId: 'user-1',
        username: 'PlayerOne',
        status: 'attending',
        wowClass: 'Warrior',
        wowSpec: 'Protection',
      },
      {
        id: 'att-2',
        userId: 'user-2',
        username: 'PlayerTwo',
        status: 'attending',
        wowClass: 'Priest',
        wowSpec: 'Holy',
      },
      {
        id: 'att-3',
        userId: 'user-3',
        username: 'PlayerThree',
        status: 'opted_out',
        wowClass: 'Mage',
        wowSpec: 'Fire',
      },
    ],
    ...overrides,
  };
}

function buildMockInteraction(optionOverrides: Record<string, any> = {}, extras: Record<string, any> = {}) {
  const options: Record<string, any> = {
    raid_id: { value: 'raid-123' },
    message: undefined,
    ...optionOverrides,
  };

  const rolesCache = new MockCollection<string, any>();
  rolesCache.set('role-raider', { id: 'role-raider', name: 'Raider' });

  const sentMessage = { id: 'msg-reminder-1' };

  const mockChannel = {
    id: 'channel-123',
    isTextBased: jest.fn().mockReturnValue(true),
    send: jest.fn().mockResolvedValue(sentMessage),
  };

  const mockInteraction: any = {
    isChatInputCommand: jest.fn().mockReturnValue(true),
    guild: {
      id: 'guild-123',
      name: 'Test Guild',
      members: {
        cache: new Map(),
        fetch: jest.fn().mockResolvedValue(undefined),
      },
      roles: { cache: rolesCache },
    },
    channel: mockChannel,
    member: {
      user: { bot: false, id: 'user-leader' },
      roles: { cache: new Map() },
      displayName: 'Leader',
    },
    user: { id: 'user-leader' },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    client: {
      channels: {
        fetch: jest.fn().mockResolvedValue(mockChannel),
      },
    },
    options: {
      getSubcommand: jest.fn().mockReturnValue('remind'),
      get: jest.fn((key: string, required?: boolean) => {
        return options[key] || (required ? { value: null } : undefined);
      }),
    },
    ...extras,
  };

  return mockInteraction;
}

describe('handleRemindRaid()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (canManageRaids as jest.Mock).mockResolvedValue(true);
  });

  describe('Backward compatibility (no custom message)', () => {
    it('should send reminder without custom message field when no message option provided', async () => {
      const raid = makeRaid();
      (prisma.raid.findUnique as jest.Mock).mockResolvedValueOnce(raid);

      const interaction = buildMockInteraction();
      await command.execute(interaction);

      // Should send reminder to channel
      const channel = await interaction.client.channels.fetch('channel-123');
      expect(channel.send).toHaveBeenCalledTimes(1);

      const sendCall = channel.send.mock.calls[0][0];
      const embed = sendCall.embeds[0];

      // Should have the reminder embed
      expect(embed).toBeDefined();
      expect(embed.data.title).toBe('🔔 Raid Reminder');

      // Should NOT have a custom message field
      const customMessageField = embed.data.fields?.find(
        (f: any) => f.name.includes('Message from Raid Leader')
      );
      expect(customMessageField).toBeUndefined();

      // Should confirm reminder sent
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Sunday Raid Night'),
        })
      );
    });

    it('should show opted-out players when present (no custom message)', async () => {
      const raid = makeRaid();
      (prisma.raid.findUnique as jest.Mock).mockResolvedValueOnce(raid);

      const interaction = buildMockInteraction();
      await command.execute(interaction);

      const channel = await interaction.client.channels.fetch('channel-123');
      const sendCall = channel.send.mock.calls[0][0];
      const embed = sendCall.embeds[0];

      // Should have opted-out players field
      const optedOutField = embed.data.fields?.find(
        (f: any) => f.name.includes('Currently Opted Out')
      );
      expect(optedOutField).toBeDefined();
      expect(optedOutField.value).toContain('PlayerThree');
    });
  });

  describe('Custom message functionality', () => {
    it('should include custom message in embed when message option is provided', async () => {
      const raid = makeRaid();
      (prisma.raid.findUnique as jest.Mock).mockResolvedValueOnce(raid);

      const interaction = buildMockInteraction({
        message: { value: 'Bring potions and flasks!' },
      });
      await command.execute(interaction);

      const channel = await interaction.client.channels.fetch('channel-123');
      const sendCall = channel.send.mock.calls[0][0];
      const embed = sendCall.embeds[0];

      // Should have custom message field
      const customMessageField = embed.data.fields?.find(
        (f: any) => f.name.includes('Message from Raid Leader')
      );
      expect(customMessageField).toBeDefined();
      expect(customMessageField.value).toBe('Bring potions and flasks!');
    });

    it('should truncate custom message to 1024 characters for Discord embed limit', async () => {
      const raid = makeRaid();
      (prisma.raid.findUnique as jest.Mock).mockResolvedValueOnce(raid);

      // Create a message longer than 1024 characters
      const longMessage = 'A'.repeat(1100);

      const interaction = buildMockInteraction({
        message: { value: longMessage },
      });
      await command.execute(interaction);

      const channel = await interaction.client.channels.fetch('channel-123');
      const sendCall = channel.send.mock.calls[0][0];
      const embed = sendCall.embeds[0];

      const customMessageField = embed.data.fields?.find(
        (f: any) => f.name.includes('Message from Raid Leader')
      );
      expect(customMessageField).toBeDefined();
      // Should be truncated to 1021 chars + '...' = 1024
      expect(customMessageField.value.length).toBeLessThanOrEqual(1024);
      expect(customMessageField.value).toContain('...');
    });

    it('should not truncate custom message that is exactly 1024 characters', async () => {
      const raid = makeRaid();
      (prisma.raid.findUnique as jest.Mock).mockResolvedValueOnce(raid);

      const exactMessage = 'B'.repeat(1024);

      const interaction = buildMockInteraction({
        message: { value: exactMessage },
      });
      await command.execute(interaction);

      const channel = await interaction.client.channels.fetch('channel-123');
      const sendCall = channel.send.mock.calls[0][0];
      const embed = sendCall.embeds[0];

      const customMessageField = embed.data.fields?.find(
        (f: any) => f.name.includes('Message from Raid Leader')
      );
      expect(customMessageField).toBeDefined();
      expect(customMessageField.value).toBe(exactMessage);
      expect(customMessageField.value).not.toContain('...');
    });
  });

  describe('Opted-out players display', () => {
    it('should not show opted-out field when no players have opted out', async () => {
      const raid = makeRaid({
        attendance: [
          { id: 'att-1', userId: 'user-1', username: 'PlayerOne', status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' },
          { id: 'att-2', userId: 'user-2', username: 'PlayerTwo', status: 'attending', wowClass: 'Priest', wowSpec: 'Holy' },
        ],
      });
      (prisma.raid.findUnique as jest.Mock).mockResolvedValueOnce(raid);

      const interaction = buildMockInteraction();
      await command.execute(interaction);

      const channel = await interaction.client.channels.fetch('channel-123');
      const sendCall = channel.send.mock.calls[0][0];
      const embed = sendCall.embeds[0];

      // Should NOT have opted-out field
      const optedOutField = embed.data.fields?.find(
        (f: any) => f.name.includes('Currently Opted Out')
      );
      expect(optedOutField).toBeUndefined();
    });

    it('should list multiple opted-out players', async () => {
      const raid = makeRaid({
        attendance: [
          { id: 'att-1', userId: 'user-1', username: 'PlayerOne', status: 'attending', wowClass: null, wowSpec: null },
          { id: 'att-2', userId: 'user-2', username: 'PlayerTwo', status: 'opted_out', wowClass: null, wowSpec: null },
          { id: 'att-3', userId: 'user-3', username: 'PlayerThree', status: 'opted_out', wowClass: null, wowSpec: null },
          { id: 'att-4', userId: 'user-4', username: 'PlayerFour', status: 'opted_out', wowClass: null, wowSpec: null },
        ],
      });
      (prisma.raid.findUnique as jest.Mock).mockResolvedValueOnce(raid);

      const interaction = buildMockInteraction();
      await command.execute(interaction);

      const channel = await interaction.client.channels.fetch('channel-123');
      const sendCall = channel.send.mock.calls[0][0];
      const embed = sendCall.embeds[0];

      const optedOutField = embed.data.fields?.find(
        (f: any) => f.name.includes('Currently Opted Out')
      );
      expect(optedOutField).toBeDefined();
      expect(optedOutField.name).toContain('(3)');
      expect(optedOutField.value).toContain('PlayerTwo');
      expect(optedOutField.value).toContain('PlayerThree');
      expect(optedOutField.value).toContain('PlayerFour');
    });
  });

  describe('Permission and error handling', () => {
    it('should reject users without permission', async () => {
      (canManageRaids as jest.Mock).mockResolvedValue(false);

      const interaction = buildMockInteraction();
      await command.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('do not have permission'),
        })
      );
    });

    it('should return error for non-existent raid', async () => {
      (prisma.raid.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const interaction = buildMockInteraction();
      await command.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Raid not found'),
        })
      );
    });

    it('should reject reminder for raid from different guild', async () => {
      const raid = makeRaid({ guildId: 'other-guild' });
      (prisma.raid.findUnique as jest.Mock).mockResolvedValueOnce(raid);

      const interaction = buildMockInteraction();
      await command.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('does not belong to this server'),
        })
      );
    });

    it('should reject reminder when channel ID is missing', async () => {
      const raid = makeRaid({ channelId: null });
      (prisma.raid.findUnique as jest.Mock).mockResolvedValueOnce(raid);

      const interaction = buildMockInteraction();
      await command.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Could not find the raid channel'),
        })
      );
    });

    it('should reject when guild is not available', async () => {
      const interaction = buildMockInteraction({}, { guild: null });
      await command.execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('can only be used in a server'),
          ephemeral: true,
        })
      );
    });
  });

  describe('Role mentions', () => {
    it('should mention roles in reminder content', async () => {
      const raid = makeRaid({ roles: 'role-raider' });
      (prisma.raid.findUnique as jest.Mock).mockResolvedValueOnce(raid);

      const interaction = buildMockInteraction();
      await command.execute(interaction);

      const channel = await interaction.client.channels.fetch('channel-123');
      const sendCall = channel.send.mock.calls[0][0];

      // Should have content with role mentions or @everyone fallback
      expect(sendCall.content).toBeDefined();
    });

    it('should fall back to @everyone when no valid roles', async () => {
      const raid = makeRaid({ roles: 'nonexistent-role' });
      (prisma.raid.findUnique as jest.Mock).mockResolvedValueOnce(raid);

      // Interaction with empty roles cache so no role matches
      const interaction = buildMockInteraction();
      interaction.guild.roles.cache = new MockCollection();
      await command.execute(interaction);

      const channel = await interaction.client.channels.fetch('channel-123');
      const sendCall = channel.send.mock.calls[0][0];

      expect(sendCall.content).toBe('@everyone');
    });
  });
});
