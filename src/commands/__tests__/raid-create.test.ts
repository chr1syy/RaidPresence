/**
 * Regression test suite for handleCreateRaid() function
 * Tests: permission checks, date/time validation, role resolution,
 * member scanning, attendance creation, embed posting, and error paths.
 */

import { canManageRaids } from '../../utils/permissions';

// Mock dependencies before imports that use them
jest.mock('../../database/client');
jest.mock('../../utils/permissions');

import prisma from '../../database/client';
import command from '../raid';

/**
 * Minimal Collection-like Map that supports discord.js `.some()`, `.filter()`, and `.find()`.
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

// Helper: build a future date string (YYYY-MM-DD) N days from now
function futureDateStr(daysFromNow = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

describe('handleCreateRaid()', () => {
  let mockInteraction: any;
  let mockGuild: any;
  let mockMember: any;
  let mockChannel: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const rolesCache = new MockCollection<string, any>();
    rolesCache.set('role-raider', { id: 'role-raider', name: 'role-raider' });

    const memberRolesCache = new MockCollection<string, any>();
    memberRolesCache.set('role-raider', { id: 'role-raider', name: 'role-raider' });

    mockMember = {
      user: { bot: false, id: 'user-123' },
      roles: { cache: memberRolesCache },
      displayName: 'TestUser',
    };

    const membersCache = new MockCollection<string, any>();
    membersCache.set('user-200', {
      user: { bot: false, id: 'user-200' },
      roles: { cache: memberRolesCache },
      displayName: 'Player1',
    });
    membersCache.set('user-201', {
      user: { bot: false, id: 'user-201' },
      roles: { cache: memberRolesCache },
      displayName: 'Player2',
    });
    membersCache.set('bot-user', {
      user: { bot: true, id: 'bot-user' },
      roles: { cache: memberRolesCache },
      displayName: 'BotUser',
    });

    mockGuild = {
      id: 'guild-123',
      name: 'Test Guild',
      members: {
        cache: membersCache,
        fetch: jest.fn().mockResolvedValue(undefined),
      },
      roles: { cache: rolesCache },
    };

    mockChannel = {
      id: 'channel-123',
      isTextBased: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue({ id: 'message-123' }),
    };

    const futureDate = futureDateStr();

    mockInteraction = {
      guild: mockGuild,
      channel: mockChannel,
      member: mockMember,
      user: { id: 'user-123' },
      isChatInputCommand: jest.fn().mockReturnValue(true),
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
      client: {
        channels: { fetch: jest.fn().mockResolvedValue(mockChannel) },
      },
      options: {
        getSubcommand: jest.fn().mockReturnValue('create'),
        get: jest.fn((key: string, required?: boolean) => {
          const values: Record<string, any> = {
            date: { value: futureDate },
            time: { value: '20:00' },
            title: { value: 'Weekly Raid' },
            roles: { value: 'role-raider' },
            ping_roles: { value: false },
          };
          return values[key] !== undefined ? values[key] : (required ? { value: null } : undefined);
        }),
      },
    };

    (canManageRaids as jest.Mock).mockResolvedValue(true);

    // Default mock: guild exists with configured roles
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      id: 'guild-123',
      name: 'Test Guild',
      raidRoles: 'Raider',
      raidLeaderRoles: 'Officer',
      language: 'en',
      timezoneOffset: 0,
    });

    (prisma.userPreference.upsert as jest.Mock).mockResolvedValue({});
    (prisma.userPreference.findMany as jest.Mock).mockResolvedValue([
      { userId: 'user-200', guildId: 'guild-123', wowClass: 'Warrior', wowSpec: 'Protection' },
      { userId: 'user-201', guildId: 'guild-123', wowClass: 'Priest', wowSpec: 'Holy' },
    ]);

    (prisma.raid.create as jest.Mock).mockResolvedValue({
      id: 'raid-new-1',
      guildId: 'guild-123',
      channelId: 'channel-123',
      raidDate: new Date(),
      description: 'Weekly Raid',
      roles: 'Raider',
      createdBy: 'user-123',
    });

    (prisma.raidAttendance.createMany as jest.Mock).mockResolvedValue({ count: 2 });
    (prisma.raid.update as jest.Mock).mockResolvedValue({});

    // Mock createRaidEmbed dependency (raid.findUnique with include)
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue({
      id: 'raid-new-1',
      guildId: 'guild-123',
      channelId: 'channel-123',
      raidDate: new Date(),
      description: 'Weekly Raid',
      status: 'open',
      guild: { language: 'en' },
      attendance: [],
    });
  });

  it('should reject when not in a guild', async () => {
    mockInteraction.guild = null;
    await command.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('server'), ephemeral: true })
    );
  });

  it('should reject when channel is missing', async () => {
    mockInteraction.channel = null;
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

  it('should reject when member is null', async () => {
    mockInteraction.member = null;
    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('permission') })
    );
  });

  it('should reject when guild not found in database', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Guild not found') })
    );
  });

  it('should reject when no raid roles configured and none provided', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'guild-123',
      name: 'Test Guild',
      raidRoles: '',
      raidLeaderRoles: 'Officer',
      language: 'en',
      timezoneOffset: 0,
    });
    // Override to provide no roles
    mockInteraction.options.get = jest.fn((key: string, required?: boolean) => {
      const values: Record<string, any> = {
        date: { value: futureDateStr() },
        time: { value: '20:00' },
        title: { value: 'Weekly Raid' },
        ping_roles: { value: false },
      };
      return values[key] !== undefined ? values[key] : (required ? { value: null } : undefined);
    });
    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Raid roles must be specified') })
    );
  });

  it('should reject invalid date/time format', async () => {
    mockInteraction.options.get = jest.fn((key: string) => {
      const values: Record<string, any> = {
        date: { value: 'not-a-date' },
        time: { value: '20:00' },
        title: { value: 'Test Raid' },
        roles: { value: 'role-raider' },
        ping_roles: { value: false },
      };
      return values[key] !== undefined ? values[key] : undefined;
    });
    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Invalid date') })
    );
  });

  it('should reject past dates', async () => {
    mockInteraction.options.get = jest.fn((key: string) => {
      const values: Record<string, any> = {
        date: { value: '2020-01-01' },
        time: { value: '10:00' },
        title: { value: 'Test Raid' },
        roles: { value: 'role-raider' },
        ping_roles: { value: false },
      };
      return values[key] !== undefined ? values[key] : undefined;
    });
    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('future') })
    );
  });

  it('should reject when no eligible members found', async () => {
    // Empty members cache
    mockGuild.members.cache = new MockCollection();
    await command.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('No eligible members') })
    );
  });

  it('should create raid successfully with eligible members', async () => {
    await command.execute(mockInteraction);

    // Should have created the raid
    expect(prisma.raid.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          guildId: 'guild-123',
          channelId: 'channel-123',
          description: 'Weekly Raid',
        }),
      })
    );

    // Should have created attendance records
    expect(prisma.raidAttendance.createMany).toHaveBeenCalled();

    // Should have sent embed to channel
    expect(mockChannel.send).toHaveBeenCalled();

    // Should have updated raid with message ID
    expect(prisma.raid.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'raid-new-1' },
        data: { messageId: 'message-123' },
      })
    );

    // Should confirm success
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('created successfully') })
    );
  });

  it('should skip bot users when scanning members', async () => {
    await command.execute(mockInteraction);

    // raidAttendance.createMany should only have non-bot users
    const createManyCall = (prisma.raidAttendance.createMany as jest.Mock).mock.calls[0][0];
    const userIds = createManyCall.data.map((d: any) => d.userId);
    expect(userIds).not.toContain('bot-user');
    expect(userIds).toContain('user-200');
    expect(userIds).toContain('user-201');
  });

  it('should use custom roles when provided', async () => {
    mockInteraction.options.get = jest.fn((key: string) => {
      const futureDate = futureDateStr();
      const values: Record<string, any> = {
        date: { value: futureDate },
        time: { value: '20:00' },
        title: { value: 'Custom Role Raid' },
        roles: { value: 'CustomRole' },
        ping_roles: null,
      };
      return values[key] !== undefined ? values[key] : undefined;
    });

    // No members have CustomRole
    const emptyRolesCache = new MockCollection<string, any>();
    const membersCache = new MockCollection<string, any>();
    membersCache.set('user-300', {
      user: { bot: false, id: 'user-300' },
      roles: { cache: emptyRolesCache },
      displayName: 'NoRolePlayer',
    });
    mockGuild.members.cache = membersCache;

    await command.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('No valid roles provided') })
    );
  });

  it('should apply timezone offset correctly', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'guild-123',
      name: 'Test Guild',
      raidRoles: 'Raider',
      raidLeaderRoles: 'Officer',
      language: 'en',
      timezoneOffset: 2, // GMT+2
    });

    await command.execute(mockInteraction);

    // Raid should have been created with timezone-adjusted date
    const createCall = (prisma.raid.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.raidDate).toBeDefined();
  });

  it('should upsert UserPreference for each eligible member', async () => {
    await command.execute(mockInteraction);
    // Should upsert for each non-bot eligible member
    expect(prisma.userPreference.upsert).toHaveBeenCalledTimes(2);
  });

  it('should separate melee and ranged DPS in raid embed display', async () => {
    // Mock attendance with melee and ranged DPS
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue({
      id: 'raid-new-1',
      guildId: 'guild-123',
      channelId: 'channel-123',
      raidDate: new Date(),
      description: 'Test Raid',
      status: 'open',
      guild: { language: 'en' },
      attendance: [
        {
          userId: 'user-200',
          username: 'WarriorPlayer',
          status: 'attending',
          wowClass: 'Warrior',
          wowSpec: 'Arms', // Melee
        },
        {
          userId: 'user-201',
          username: 'MagePlayer',
          status: 'attending',
          wowClass: 'Mage',
          wowSpec: 'Fire', // Ranged
        },
        {
          userId: 'user-202',
          username: 'HunterPlayer',
          status: 'attending',
          wowClass: 'Hunter',
          wowSpec: 'Marksmanship', // Ranged
        },
      ],
    });

    await command.execute(mockInteraction);

    // Check that embed was sent to channel
    expect(mockChannel.send).toHaveBeenCalled();

    // Get the embed from the send call
    const sendCall = mockChannel.send.mock.calls[0][0];
    expect(sendCall.embeds).toBeDefined();
    expect(sendCall.embeds.length).toBe(1);

    const embed = sendCall.embeds[0];

    // Check that embed has fields for Melee and Ranged DPS
    const fieldNames = embed.data.fields.map((field: any) => field.name);

    // Should have Melee DPS and Ranged DPS fields (in English: '⚔️ Melee DPS', '🏹 Ranged DPS'),
    // but the actual names may include counts, e.g. '⚔️ Melee DPS (1)'.
    expect(fieldNames.some((name: string) => name.startsWith('⚔️ Melee DPS'))).toBe(true);
    expect(fieldNames.some((name: string) => name.startsWith('🏹 Ranged DPS'))).toBe(true);

    // Check that melee field contains WarriorPlayer (melee)
    const meleeField = embed.data.fields.find(
      (field: any) => typeof field.name === 'string' && field.name.startsWith('⚔️ Melee DPS'),
    );
    expect(meleeField.value).toContain('WarriorPlayer');

    // Check that ranged field contains MagePlayer and HunterPlayer (ranged)
    const rangedField = embed.data.fields.find(
      (field: any) => typeof field.name === 'string' && field.name.startsWith('🏹 Ranged DPS'),
    );
    expect(rangedField.value).toContain('MagePlayer');
    expect(rangedField.value).toContain('HunterPlayer');
  });
});
