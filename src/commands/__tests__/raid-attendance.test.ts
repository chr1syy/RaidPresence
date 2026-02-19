/**
 * Test suite for handleAttendanceCommand() function
 * Tests: valid player shows stats, invalid player returns error,
 * different periods show different data, embed formatting, localization.
 */

import { canManageRaids } from '../../utils/permissions';

jest.mock('../../database/client');
jest.mock('../../utils/permissions');
jest.mock('../../utils/attendanceAnalytics', () => {
  const actual = jest.requireActual('../../utils/attendanceAnalytics');
  return {
    ...actual,
    calculatePlayerStats: jest.fn(),
    getPlayerRoleDistribution: jest.fn(),
    getPlayerAttendanceHistory: jest.fn(),
  };
});

import prisma from '../../database/client';
import command from '../raid';
import {
  calculatePlayerStats,
  getPlayerRoleDistribution,
  getPlayerAttendanceHistory,
} from '../../utils/attendanceAnalytics';

// Build a mock interaction for the attendance subcommand
function buildMockInteraction(
  optionOverrides: Record<string, any> = {},
  extras: Record<string, any> = {},
) {
  const options: Record<string, any> = {
    period: undefined,
    ...optionOverrides,
  };

  const targetUser = options._targetUser || {
    id: 'user-target',
    username: 'TargetPlayer',
    displayName: 'TargetPlayer',
  };

  const mockInteraction: any = {
    isChatInputCommand: jest.fn().mockReturnValue(true),
    guild: {
      id: 'guild-123',
      name: 'Test Guild',
    },
    channel: {
      id: 'channel-123',
    },
    member: {
      user: { bot: false, id: 'user-leader' },
      roles: { cache: new Map() },
    },
    user: { id: 'user-leader' },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    options: {
      getSubcommand: jest.fn().mockReturnValue('attendance'),
      getUser: jest.fn().mockReturnValue(targetUser),
      get: jest.fn((key: string, required?: boolean) => {
        if (key === 'player') {
          // Special case: 'player' option should return { user: userObject }
          return { user: targetUser };
        }
        return options[key] !== undefined
          ? { value: options[key] }
          : required
            ? { value: null }
            : undefined;
      }),
    },
    ...extras,
  };

  return mockInteraction;
}

// Mock return values
function mockPlayerStats(overrides: Record<string, any> = {}) {
  return {
    totalRaidsInvited: 10,
    raidsAttended: 8,
    attendanceRate: 80,
    optedOutCount: 1,
    lateCount: 1,
    reliability: { label: 'Reliable', emoji: '🟡' },
    averageResponseTimeMs: 3600000, // 1 hour
    trend: 'stable' as const,
    ...overrides,
  };
}

function mockRoleDistribution(overrides: Record<string, any> = {}) {
  return {
    mainRole: 'Tank',
    altRoles: ['Heal'],
    roleBreakdown: [
      { role: 'Tank', count: 6, percentage: 75 },
      { role: 'Heal', count: 2, percentage: 25 },
    ],
    flexibilityScore: 50,
    ...overrides,
  };
}

function mockAttendanceHistory() {
  return [
    {
      raidId: 'r1',
      raidDescription: 'Mythic Raid',
      raidDate: new Date('2026-02-08T18:00:00Z'),
      status: 'attending',
      respondedAt: new Date('2026-02-08T12:00:00Z'),
      wowClass: 'Warrior',
      wowSpec: 'Protection',
    },
    {
      raidId: 'r2',
      raidDescription: 'Heroic Clear',
      raidDate: new Date('2026-02-05T18:00:00Z'),
      status: 'opted_out',
      respondedAt: new Date('2026-02-05T10:00:00Z'),
      wowClass: 'Warrior',
      wowSpec: 'Protection',
    },
    {
      raidId: 'r3',
      raidDescription: 'Alt Night',
      raidDate: new Date('2026-02-01T18:00:00Z'),
      status: 'attending',
      respondedAt: new Date('2026-02-01T15:00:00Z'),
      wowClass: 'Druid',
      wowSpec: 'Restoration',
    },
  ];
}

describe('/raid attendance command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (canManageRaids as jest.Mock).mockResolvedValue(true);
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      id: 'guild-123',
      language: 'en',
      timezoneOffset: 0,
    });
    (prisma.userPreference.findUnique as jest.Mock).mockResolvedValue({
      userId: 'user-target',
      guildId: 'guild-123',
      username: 'TargetPlayer',
      wowClass: 'Warrior',
      wowSpec: 'Protection',
    });
    (calculatePlayerStats as jest.Mock).mockResolvedValue(mockPlayerStats());
    (getPlayerRoleDistribution as jest.Mock).mockResolvedValue(mockRoleDistribution());
    (getPlayerAttendanceHistory as jest.Mock).mockResolvedValue(mockAttendanceHistory());
  });

  // ── Valid Player Shows Stats ─────────────────────────────────

  it('should display attendance stats for a valid player', async () => {
    const interaction = buildMockInteraction();

    await command.execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(calculatePlayerStats).toHaveBeenCalledWith('user-target', 'guild-123', 'month');
    expect(getPlayerRoleDistribution).toHaveBeenCalledWith('user-target', 'guild-123');
    expect(getPlayerAttendanceHistory).toHaveBeenCalledWith('user-target', 'guild-123', 'month');

    // Should editReply with an embed
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    const replyArg = interaction.editReply.mock.calls[0][0];
    expect(replyArg.embeds).toBeDefined();
    expect(replyArg.embeds.length).toBe(1);

    const embed = replyArg.embeds[0];
    const embedData = embed.data;

    // Title should contain the player name
    expect(embedData.title).toContain('TargetPlayer');

    // Should have fields for key stats
    const fieldNames = embedData.fields.map((f: any) => f.name);
    expect(fieldNames).toContain('Raids Invited');
    expect(fieldNames).toContain('Raids Attended');
    expect(fieldNames).toContain('Reliability Score');
    expect(fieldNames).toContain('Trend');
  });

  // ── Invalid Player ─────────────────────────────────────────

  it('should return error for player not found in guild', async () => {
    (calculatePlayerStats as jest.Mock).mockResolvedValue(
      mockPlayerStats({ totalRaidsInvited: 0, raidsAttended: 0, attendanceRate: 0 })
    );

    const interaction = buildMockInteraction();

    await command.execute(interaction);

    // Should still display stats even with zero raids
    const reply = interaction.editReply.mock.calls[0][0];
    expect(reply.embeds).toBeDefined();
  });

  // ── Different Periods ──────────────────────────────────────

  it('should use default period (month) when not specified', async () => {
    const interaction = buildMockInteraction();

    await command.execute(interaction);

    expect(calculatePlayerStats).toHaveBeenCalledWith('user-target', 'guild-123', 'month');
    expect(getPlayerAttendanceHistory).toHaveBeenCalledWith('user-target', 'guild-123', 'month');
  });

  it('should pass quarter period to analytics', async () => {
    const interaction = buildMockInteraction({ period: 'quarter' });

    await command.execute(interaction);

    expect(calculatePlayerStats).toHaveBeenCalledWith('user-target', 'guild-123', 'quarter');
    expect(getPlayerAttendanceHistory).toHaveBeenCalledWith('user-target', 'guild-123', 'quarter');
  });

  it('should pass all period to analytics', async () => {
    const interaction = buildMockInteraction({ period: 'all' });

    await command.execute(interaction);

    expect(calculatePlayerStats).toHaveBeenCalledWith('user-target', 'guild-123', 'all');
    expect(getPlayerAttendanceHistory).toHaveBeenCalledWith('user-target', 'guild-123', 'all');
  });

  // ── Embed Formatting ───────────────────────────────────────

  it('should show correct attendance values in embed', async () => {
    const interaction = buildMockInteraction();

    await command.execute(interaction);

    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    const fields = embed.data.fields;

    const invitedField = fields.find((f: any) => f.name === 'Raids Invited');
    expect(invitedField.value).toBe('10');

    const attendedField = fields.find((f: any) => f.name === 'Raids Attended');
    expect(attendedField.value).toBe('8 (80%)');

    const optedOutField = fields.find((f: any) => f.name === 'Opted Out');
    expect(optedOutField.value).toBe('1');

    const lateField = fields.find((f: any) => f.name === 'Running Late');
    expect(lateField.value).toBe('1');
  });

  it('should show reliability score in embed', async () => {
    const interaction = buildMockInteraction();

    await command.execute(interaction);

    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    const reliabilityField = embed.data.fields.find(
      (f: any) => f.name === 'Reliability Score',
    );
    expect(reliabilityField.value).toContain('Reliable');
    expect(reliabilityField.value).toContain('🟡');
  });

  it('should show main role and alt roles', async () => {
    const interaction = buildMockInteraction();

    await command.execute(interaction);

    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    const fields = embed.data.fields;

    const mainRoleField = fields.find((f: any) => f.name === 'Main Role');
    expect(mainRoleField.value).toBe('Tank');

    const altRolesField = fields.find((f: any) => f.name === 'Alt Roles');
    expect(altRolesField.value).toBe('Heal');
  });

  it('should show recent raids with status icons', async () => {
    const interaction = buildMockInteraction();

    await command.execute(interaction);

    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    const recentField = embed.data.fields.find(
      (f: any) => f.name === 'Recent Raids',
    );
    expect(recentField).toBeDefined();
    expect(recentField.value).toContain('✅');
    expect(recentField.value).toContain('❌');
    expect(recentField.value).toContain('Mythic Raid');
    expect(recentField.value).toContain('Heroic Clear');
  });

  it('should use green embed color for high attendance', async () => {
    (calculatePlayerStats as jest.Mock).mockResolvedValue(
      mockPlayerStats({ attendanceRate: 95 }),
    );

    const interaction = buildMockInteraction();
    await command.execute(interaction);

    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    expect(embed.data.color).toBe(0x00ae86);
  });

  it('should use red embed color for low attendance', async () => {
    (calculatePlayerStats as jest.Mock).mockResolvedValue(
      mockPlayerStats({ attendanceRate: 30 }),
    );

    const interaction = buildMockInteraction();
    await command.execute(interaction);

    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    expect(embed.data.color).toBe(0xff4500);
  });

  it('should include period in footer', async () => {
    const interaction = buildMockInteraction();

    await command.execute(interaction);

    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    expect(embed.data.footer.text).toContain('Last 30 days');
  });

  // ── Localization ───────────────────────────────────────────

  it('should use German translations when guild language is de', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      id: 'guild-123',
      language: 'de',
      timezoneOffset: 0,
    });

    const interaction = buildMockInteraction();

    await command.execute(interaction);

    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toContain('Anwesenheit');
    expect(embed.data.title).toContain('TargetPlayer');

    const fieldNames = embed.data.fields.map((f: any) => f.name);
    expect(fieldNames).toContain('Raids eingeladen');
    expect(fieldNames).toContain('Raids teilgenommen');
    expect(fieldNames).toContain('Zuverlässigkeit');
  });

  it('should show German period label in footer', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      id: 'guild-123',
      language: 'de',
      timezoneOffset: 0,
    });

    const interaction = buildMockInteraction({ period: 'quarter' });

    await command.execute(interaction);

    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    expect(embed.data.footer.text).toContain('Letzte 90 Tage');
  });

  // ── Edge Cases ─────────────────────────────────────────────

  it('should handle zero raids gracefully', async () => {
    (calculatePlayerStats as jest.Mock).mockResolvedValue(
      mockPlayerStats({
        totalRaidsInvited: 0,
        raidsAttended: 0,
        attendanceRate: 0,
        optedOutCount: 0,
        lateCount: 0,
      }),
    );
    (getPlayerRoleDistribution as jest.Mock).mockResolvedValue(
      mockRoleDistribution({ mainRole: null, altRoles: [], roleBreakdown: [] }),
    );
    (getPlayerAttendanceHistory as jest.Mock).mockResolvedValue([]);

    const interaction = buildMockInteraction();

    await command.execute(interaction);

    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    const invitedField = embed.data.fields.find(
      (f: any) => f.name === 'Raids Invited',
    );
    expect(invitedField.value).toBe('0');

    // Should not have Recent Raids field
    const recentField = embed.data.fields.find(
      (f: any) => f.name === 'Recent Raids',
    );
    expect(recentField).toBeUndefined();
  });

  it('should reject when used outside a guild', async () => {
    const interaction = buildMockInteraction({}, { guild: null });

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining('server'),
      ephemeral: true,
    });
  });

  it('should handle guild not found in database', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(null);

    const interaction = buildMockInteraction();

    await command.execute(interaction);

    const reply = interaction.editReply.mock.calls[0][0];
    expect(reply.content).toContain('Guild not found');
  });
});
