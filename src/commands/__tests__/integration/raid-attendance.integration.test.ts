/**
 * Integration Tests for /raid attendance command (Task 2.1.6)
 *
 * Unlike the unit tests in raid-attendance.test.ts (which mock the analytics
 * module), these tests exercise the full pipeline:
 *   Command handler → attendanceAnalytics → attendanceFormatter → embed
 *
 * Only Prisma is mocked; analytics functions run against realistic DB return data.
 */

import { canManageRaids } from '../../../utils/permissions';

jest.mock('../../../database/client');
jest.mock('../../../utils/permissions');

import prisma from '../../../database/client';
import command from '../../raid';

// ─── Helpers ──────────────────────────────────────────────────────

const guildData = {
  id: 'guild-int',
  name: 'Integration Guild',
  language: 'en',
  timezoneOffset: 0,
  raidLeaderRoles: 'role-leader',
  raidRoles: 'role-raider',
};

/**
 * Build a mock interaction targeting the attendance subcommand.
 */
function buildAttendanceInteraction(
  targetUser: { id: string; username: string },
  period?: string,
  extras: Record<string, any> = {},
) {
  return {
    isChatInputCommand: jest.fn().mockReturnValue(true),
    guild: { id: 'guild-int', name: 'Integration Guild' },
    channel: { id: 'channel-int' },
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
      get: jest.fn((key: string) => {
        if (key === 'player') return { user: { ...targetUser, displayName: targetUser.username } };
        if (key === 'period' && period) return { value: period };
        return undefined;
      }),
    },
    ...extras,
  } as any;
}

/**
 * Build a Prisma-like attendance record with raid data included.
 * Matches the shape returned by prisma.raidAttendance.findMany with includes.
 */
function makeRecord(overrides: {
  raidId: string;
  status: string;
  raidDate: Date;
  createdAt?: Date;
  respondedAt?: Date | null;
  wowClass?: string | null;
  wowSpec?: string | null;
  description?: string | null;
}) {
  const createdAt = overrides.createdAt ?? new Date(overrides.raidDate.getTime() - 86400000);
  return {
    id: `att-${overrides.raidId}-${Math.random().toString(36).slice(2, 6)}`,
    raidId: overrides.raidId,
    userId: 'target-user',
    guildId: 'guild-int',
    username: 'TestPlayer',
    status: overrides.status,
    wowClass: overrides.wowClass ?? 'Warrior',
    wowSpec: overrides.wowSpec ?? 'Protection',
    respondedAt: overrides.respondedAt ?? new Date(overrides.raidDate.getTime() - 3600000),
    raid: {
      id: overrides.raidId,
      description: overrides.description ?? `Raid ${overrides.raidId}`,
      raidDate: overrides.raidDate,
      createdAt,
    },
  };
}

// ─── Test Suite ───────────────────────────────────────────────────

describe('Integration: /raid attendance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (canManageRaids as jest.Mock).mockResolvedValue(true);
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ ...guildData });
  });

  // ═══════════════════════════════════════════════════════════════
  // Scenario 1: Valid player with mixed attendance shows correct stats
  // ═══════════════════════════════════════════════════════════════
  describe('Scenario 1: Valid player with mixed attendance', () => {
    it('should calculate and display correct stats end-to-end', async () => {
      const now = new Date();
      const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

      const records = [
        makeRecord({ raidId: 'r1', status: 'attending', raidDate: daysAgo(3) }),
        makeRecord({ raidId: 'r2', status: 'attending', raidDate: daysAgo(7) }),
        makeRecord({ raidId: 'r3', status: 'opted_out', raidDate: daysAgo(10) }),
        makeRecord({ raidId: 'r4', status: 'attending', raidDate: daysAgo(14) }),
        makeRecord({ raidId: 'r5', status: 'late', raidDate: daysAgo(21) }),
      ];

      // Mock userPreference
      (prisma.userPreference.findUnique as jest.Mock).mockResolvedValue({
        userId: 'target-user',
        guildId: 'guild-int',
        username: 'TestPlayer',
        wowClass: 'Warrior',
        wowSpec: 'Protection',
      });

      // Mock raidAttendance.findMany — called by calculatePlayerStats,
      // getPlayerRoleDistribution, and getPlayerAttendanceHistory
      (prisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

      const interaction = buildAttendanceInteraction(
        { id: 'target-user', username: 'TestPlayer' },
      );

      await command.execute(interaction);

      // Verify embed was sent
      expect(interaction.editReply).toHaveBeenCalledTimes(1);
      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      const fields = embed.data.fields;

      // Title contains player name
      expect(embed.data.title).toContain('TestPlayer');

      // 5 raids total: 3 attending + 1 late + 1 opted_out = 4/5 = 80%
      const invitedField = fields.find((f: any) => f.name === 'Raids Invited');
      expect(invitedField.value).toBe('5');

      const attendedField = fields.find((f: any) => f.name === 'Raids Attended');
      expect(attendedField.value).toBe('4 (80%)');

      const optedOutField = fields.find((f: any) => f.name === 'Opted Out');
      expect(optedOutField.value).toBe('1');

      const lateField = fields.find((f: any) => f.name === 'Running Late');
      expect(lateField.value).toBe('1');

      // 80% => Reliable 🟡
      const reliabilityField = fields.find((f: any) => f.name === 'Reliability Score');
      expect(reliabilityField.value).toContain('Reliable');
      expect(reliabilityField.value).toContain('🟡');

      // All records are Warrior/Protection → main role should be Tank
      const mainRoleField = fields.find((f: any) => f.name === 'Main Role');
      expect(mainRoleField.value).toBe('Tank');

      // Recent raids field should be present (5 raids, limited to 5)
      const recentField = fields.find((f: any) => f.name === 'Recent Raids');
      expect(recentField).toBeDefined();
      expect(recentField.value).toContain('✅');
      expect(recentField.value).toContain('❌');

      // 80% → green color
      expect(embed.data.color).toBe(0x00ae86);

      // Footer should say "Last 30 days" (default period)
      expect(embed.data.footer.text).toContain('Last 30 days');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Scenario 2: Invalid player returns error
  // ═══════════════════════════════════════════════════════════════
  describe('Scenario 2: Player not found in guild', () => {
    it('should display empty stats for unknown player', async () => {
      (prisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

      const interaction = buildAttendanceInteraction(
        { id: 'unknown-user', username: 'GhostPlayer' },
      );

      await command.execute(interaction);

      // Should still send an embed with 0 stats
      const reply = interaction.editReply.mock.calls[0][0];
      expect(reply.embeds).toBeDefined();
      const embed = reply.embeds[0];
      expect(embed.data.title).toContain('GhostPlayer');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Scenario 3: Different periods filter different data
  // ═══════════════════════════════════════════════════════════════
  describe('Scenario 3: Period filtering', () => {
    it('should pass the correct period and display the right footer', async () => {
      (prisma.userPreference.findUnique as jest.Mock).mockResolvedValue({
        userId: 'target-user',
        guildId: 'guild-int',
        username: 'PeriodPlayer',
      });

      const records = [
        makeRecord({ raidId: 'rp1', status: 'attending', raidDate: new Date() }),
      ];
      (prisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

      // Test quarter period
      const interaction = buildAttendanceInteraction(
        { id: 'target-user', username: 'PeriodPlayer' },
        'quarter',
      );

      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.footer.text).toContain('Last 90 days');

      // Verify the Prisma calls include the date cutoff filter
      const findManyCalls = (prisma.raidAttendance.findMany as jest.Mock).mock.calls;
      // calculatePlayerStats call should have a raidDate filter
      const statsCall = findManyCalls[0][0];
      expect(statsCall.where.userId).toBe('target-user');
      expect(statsCall.where.guildId).toBe('guild-int');
      expect(statsCall.where.raid.raidDate.gte).toBeInstanceOf(Date);
    });

    it('should show "All time" footer for all period', async () => {
      (prisma.userPreference.findUnique as jest.Mock).mockResolvedValue({
        userId: 'target-user',
        guildId: 'guild-int',
        username: 'AllTimePlayer',
      });

      (prisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
        makeRecord({ raidId: 'ra1', status: 'attending', raidDate: new Date() }),
      ]);

      const interaction = buildAttendanceInteraction(
        { id: 'target-user', username: 'AllTimePlayer' },
        'all',
      );

      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.footer.text).toContain('All time');

      // For "all" period, no date filter should be applied
      const statsCall = (prisma.raidAttendance.findMany as jest.Mock).mock.calls[0][0];
      expect(statsCall.where.raid).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Scenario 4: Embed formatting with edge case data
  // ═══════════════════════════════════════════════════════════════
  describe('Scenario 4: Embed formatting correctness', () => {
    it('should show red color and Inconsistent for low attendance', async () => {
      (prisma.userPreference.findUnique as jest.Mock).mockResolvedValue({
        userId: 'target-user',
        guildId: 'guild-int',
        username: 'SlackerPlayer',
      });

      const now = new Date();
      const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

      // 1 attending, 4 opted out → 20% attendance
      const records = [
        makeRecord({ raidId: 'lr1', status: 'attending', raidDate: daysAgo(3) }),
        makeRecord({ raidId: 'lr2', status: 'opted_out', raidDate: daysAgo(7) }),
        makeRecord({ raidId: 'lr3', status: 'opted_out', raidDate: daysAgo(10) }),
        makeRecord({ raidId: 'lr4', status: 'opted_out', raidDate: daysAgo(14) }),
        makeRecord({ raidId: 'lr5', status: 'opted_out', raidDate: daysAgo(21) }),
      ];
      (prisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

      const interaction = buildAttendanceInteraction(
        { id: 'target-user', username: 'SlackerPlayer' },
      );

      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];

      // 20% → red color
      expect(embed.data.color).toBe(0xff4500);

      // 20% → Inconsistent 🔴
      const reliability = embed.data.fields.find((f: any) => f.name === 'Reliability Score');
      expect(reliability.value).toContain('Inconsistent');
      expect(reliability.value).toContain('🔴');

      // 1/5 = 20%
      const attended = embed.data.fields.find((f: any) => f.name === 'Raids Attended');
      expect(attended.value).toBe('1 (20%)');
    });

    it('should show green and Highly Reliable for perfect attendance', async () => {
      (prisma.userPreference.findUnique as jest.Mock).mockResolvedValue({
        userId: 'target-user',
        guildId: 'guild-int',
        username: 'PerfectPlayer',
      });

      const now = new Date();
      const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

      const records = [
        makeRecord({ raidId: 'pr1', status: 'attending', raidDate: daysAgo(3) }),
        makeRecord({ raidId: 'pr2', status: 'attending', raidDate: daysAgo(7) }),
        makeRecord({ raidId: 'pr3', status: 'attending', raidDate: daysAgo(10) }),
        makeRecord({ raidId: 'pr4', status: 'attending', raidDate: daysAgo(14) }),
      ];
      (prisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

      const interaction = buildAttendanceInteraction(
        { id: 'target-user', username: 'PerfectPlayer' },
      );

      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];

      // 100% → green
      expect(embed.data.color).toBe(0x00ae86);

      // 100% → Highly Reliable 🟢
      const reliability = embed.data.fields.find((f: any) => f.name === 'Reliability Score');
      expect(reliability.value).toContain('Highly Reliable');
      expect(reliability.value).toContain('🟢');

      // 4/4 = 100%
      const attended = embed.data.fields.find((f: any) => f.name === 'Raids Attended');
      expect(attended.value).toBe('4 (100%)');
    });

    it('should handle player with zero raids gracefully', async () => {
      (prisma.userPreference.findUnique as jest.Mock).mockResolvedValue({
        userId: 'target-user',
        guildId: 'guild-int',
        username: 'NewPlayer',
      });

      // No attendance records at all
      (prisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

      const interaction = buildAttendanceInteraction(
        { id: 'target-user', username: 'NewPlayer' },
      );

      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      const fields = embed.data.fields;

      const invitedField = fields.find((f: any) => f.name === 'Raids Invited');
      expect(invitedField.value).toBe('0');

      const attendedField = fields.find((f: any) => f.name === 'Raids Attended');
      expect(attendedField.value).toBe('0 (0%)');

      // No recent raids
      const recentField = fields.find((f: any) => f.name === 'Recent Raids');
      expect(recentField).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Scenario 5: Localization (German)
  // ═══════════════════════════════════════════════════════════════
  describe('Scenario 5: German localization end-to-end', () => {
    it('should display all labels in German when guild language is de', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        ...guildData,
        language: 'de',
      });

      (prisma.userPreference.findUnique as jest.Mock).mockResolvedValue({
        userId: 'target-user',
        guildId: 'guild-int',
        username: 'DeutscherSpieler',
      });

      const now = new Date();
      const records = [
        makeRecord({ raidId: 'de1', status: 'attending', raidDate: new Date(now.getTime() - 3 * 86400000) }),
        makeRecord({ raidId: 'de2', status: 'opted_out', raidDate: new Date(now.getTime() - 7 * 86400000) }),
      ];
      (prisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

      const interaction = buildAttendanceInteraction(
        { id: 'target-user', username: 'DeutscherSpieler' },
      );

      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];

      // Title should be in German
      expect(embed.data.title).toContain('Anwesenheit');
      expect(embed.data.title).toContain('DeutscherSpieler');

      // Field names should be German
      const fieldNames = embed.data.fields.map((f: any) => f.name);
      expect(fieldNames).toContain('Raids eingeladen');
      expect(fieldNames).toContain('Raids teilgenommen');
      expect(fieldNames).toContain('Zuverlässigkeit');

      // Footer in German
      expect(embed.data.footer.text).toContain('Letzte 30 Tage');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Scenario 6: Multi-role player shows correct role distribution
  // ═══════════════════════════════════════════════════════════════
  describe('Scenario 6: Multi-role player role distribution', () => {
    it('should show main role and alt roles for a flexible player', async () => {
      (prisma.userPreference.findUnique as jest.Mock).mockResolvedValue({
        userId: 'target-user',
        guildId: 'guild-int',
        username: 'FlexPlayer',
      });

      const now = new Date();
      const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

      // Player plays tank most often, but also heals
      const records = [
        makeRecord({ raidId: 'mr1', status: 'attending', raidDate: daysAgo(3), wowClass: 'Paladin', wowSpec: 'Protection' }),
        makeRecord({ raidId: 'mr2', status: 'attending', raidDate: daysAgo(7), wowClass: 'Paladin', wowSpec: 'Protection' }),
        makeRecord({ raidId: 'mr3', status: 'attending', raidDate: daysAgo(10), wowClass: 'Paladin', wowSpec: 'Holy' }),
        makeRecord({ raidId: 'mr4', status: 'attending', raidDate: daysAgo(14), wowClass: 'Paladin', wowSpec: 'Protection' }),
      ];
      (prisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

      const interaction = buildAttendanceInteraction(
        { id: 'target-user', username: 'FlexPlayer' },
      );

      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      const fields = embed.data.fields;

      // Main role should be Tank (3 out of 4)
      const mainRoleField = fields.find((f: any) => f.name === 'Main Role');
      expect(mainRoleField).toBeDefined();
      expect(mainRoleField.value).toBe('Tank');

      // Alt roles should include Heal
      const altRolesField = fields.find((f: any) => f.name === 'Alt Roles');
      expect(altRolesField).toBeDefined();
      expect(altRolesField.value).toContain('Heal');
    });
  });
});
