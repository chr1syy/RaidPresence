/**
 * Test suite for handleStatsCommand() function
 * Tests: single raid stats, guild-wide stats, period filtering,
 * permission/validation checks, and edge cases.
 */

import { canManageRaids } from '../../utils/permissions';

jest.mock('../../database/client');
jest.mock('../../utils/permissions');

import prisma from '../../database/client';
import command from '../raid';

// Build a mock interaction for the stats subcommand
function buildMockInteraction(optionOverrides: Record<string, any> = {}, extras: Record<string, any> = {}) {
  const options: Record<string, any> = {
    raid_id: undefined,
    period: undefined,
    ...optionOverrides,
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
      getSubcommand: jest.fn().mockReturnValue('stats'),
      get: jest.fn((key: string, required?: boolean) => {
        return options[key] || (required ? { value: null } : undefined);
      }),
    },
    ...extras,
  };

  return mockInteraction;
}

// Sample attendance records
function makeAttendance(overrides: Partial<{
  userId: string;
  username: string;
  status: string;
  wowClass: string | null;
  wowSpec: string | null;
}>[] = []) {
  const defaults = [
    { id: 'a1', raidId: 'raid-1', userId: 'u1', guildId: 'guild-123', username: 'Player1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' },
    { id: 'a2', raidId: 'raid-1', userId: 'u2', guildId: 'guild-123', username: 'Player2', status: 'attending', wowClass: 'Priest', wowSpec: 'Holy' },
    { id: 'a3', raidId: 'raid-1', userId: 'u3', guildId: 'guild-123', username: 'Player3', status: 'opted_out', wowClass: 'Rogue', wowSpec: 'Assassination' },
    { id: 'a4', raidId: 'raid-1', userId: 'u4', guildId: 'guild-123', username: 'Player4', status: 'late', wowClass: 'Mage', wowSpec: 'Fire' },
    { id: 'a5', raidId: 'raid-1', userId: 'u5', guildId: 'guild-123', username: 'Player5', status: 'attending', wowClass: 'Hunter', wowSpec: 'Beast Mastery' },
  ];

  if (overrides.length > 0) {
    return overrides.map((o, i) => ({ ...defaults[i % defaults.length], ...o, id: `a${i + 1}` }));
  }
  return defaults;
}

function makeRaid(overrides: Record<string, any> = {}) {
  return {
    id: 'raid-1',
    guildId: 'guild-123',
    channelId: 'channel-123',
    raidDate: new Date('2026-03-01T18:00:00Z'),
    description: 'Mythic Raid Night',
    roles: 'role-raider',
    status: 'open',
    createdBy: 'user-leader',
    messageId: 'msg-1',
    guild: {
      id: 'guild-123',
      language: 'en',
      timezoneOffset: 0,
    },
    attendance: makeAttendance(),
    ...overrides,
  };
}

describe('/raid stats command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (canManageRaids as jest.Mock).mockResolvedValue(true);
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      id: 'guild-123',
      language: 'en',
      timezoneOffset: 0,
    });
  });

  // ── Single Raid Stats ──────────────────────────────────────

  describe('single raid stats (raid_id provided)', () => {
    it('should display stats for a valid raid', async () => {
      const raid = makeRaid();
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

      const interaction = buildMockInteraction({
        raid_id: { value: 'raid-1' },
      });

      await command.execute(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(prisma.raid.findUnique).toHaveBeenCalledWith({
        where: { id: 'raid-1' },
        include: { attendance: true },
      });

      // Should editReply with an embed
      expect(interaction.editReply).toHaveBeenCalledTimes(1);
      const replyArg = interaction.editReply.mock.calls[0][0];
      expect(replyArg.embeds).toBeDefined();
      expect(replyArg.embeds.length).toBe(1);

      const embed = replyArg.embeds[0];
      const embedData = embed.data;

      // Title should contain the raid name
      expect(embedData.title).toContain('Mythic Raid Night');

      // Should have fields for attendance rate, reliability, composition
      const fieldNames = embedData.fields.map((f: any) => f.name);
      expect(fieldNames).toContain('Attendance Rate');
      expect(fieldNames).toContain('Reliability');
      expect(fieldNames).toContain('Role Composition');
      expect(fieldNames).toContain('Class Distribution');
    });

    it('should return error for non-existent raid', async () => {
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(null);

      const interaction = buildMockInteraction({
        raid_id: { value: 'fake-raid' },
      });

      await command.execute(interaction);

      const reply = interaction.editReply.mock.calls[0][0];
      expect(reply.content).toBe('Raid not found.');
    });

    it('should reject raid from different guild', async () => {
      const raid = makeRaid({ guildId: 'other-guild' });
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

      const interaction = buildMockInteraction({
        raid_id: { value: 'raid-1' },
      });

      await command.execute(interaction);

      const reply = interaction.editReply.mock.calls[0][0];
      expect(reply.content).toBe('This raid does not belong to this server.');
    });

    it('should show correct attendance breakdown', async () => {
      // 3 attending, 1 opted out, 1 late = 3/5 = 60%
      const raid = makeRaid();
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

      const interaction = buildMockInteraction({
        raid_id: { value: 'raid-1' },
      });

      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      const fields = embed.data.fields;

      // Attendance rate: 3 attending out of 5 total = 60%
      const attendanceField = fields.find((f: any) => f.name === 'Attendance Rate');
      expect(attendanceField.value).toContain('3/5');
      expect(attendanceField.value).toContain('60');

      // Counts
      const attendingField = fields.find((f: any) => f.name === 'Attending');
      expect(attendingField.value).toBe('3');

      const optedOutField = fields.find((f: any) => f.name === 'Opted Out');
      expect(optedOutField.value).toBe('1');

      const lateField = fields.find((f: any) => f.name === 'Running Late');
      expect(lateField.value).toBe('1');
    });

    it('should show role composition from active players', async () => {
      const raid = makeRaid();
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

      const interaction = buildMockInteraction({
        raid_id: { value: 'raid-1' },
      });

      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      const compField = embed.data.fields.find((f: any) => f.name === 'Role Composition');

      // Active (attending + late): Warrior/Prot=Tank, Priest/Holy=Healer, Mage/Fire=Ranged, Hunter/BM=Ranged
      expect(compField.value).toContain('Tank: 1');
      expect(compField.value).toContain('Heal: 1');
      expect(compField.value).toContain('Ranged: 2');
    });

    it('should display class distribution', async () => {
      const raid = makeRaid();
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

      const interaction = buildMockInteraction({
        raid_id: { value: 'raid-1' },
      });

      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      const classField = embed.data.fields.find((f: any) => f.name === 'Class Distribution');

      expect(classField.value).toContain('Warrior');
      expect(classField.value).toContain('Priest');
    });

    it('should handle raid with zero attendance', async () => {
      const raid = makeRaid({ attendance: [] });
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

      const interaction = buildMockInteraction({
        raid_id: { value: 'raid-1' },
      });

      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      const attendanceField = embed.data.fields.find((f: any) => f.name === 'Attendance Rate');
      expect(attendanceField.value).toContain('0/0');

      const classField = embed.data.fields.find((f: any) => f.name === 'Class Distribution');
      expect(classField.value).toBe('-');
    });

    it('should use German translations when guild language is de', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'guild-123',
        language: 'de',
        timezoneOffset: 0,
      });

      const raid = makeRaid({
        guild: { id: 'guild-123', language: 'de', timezoneOffset: 0 },
      });
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

      const interaction = buildMockInteraction({
        raid_id: { value: 'raid-1' },
      });

      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.title).toContain('Statistiken:');

      const fieldNames = embed.data.fields.map((f: any) => f.name);
      expect(fieldNames).toContain('Teilnahmequote');
      expect(fieldNames).toContain('Zuverlässigkeit');
    });
  });

  // ── Guild Stats ─────────────────────────────────────────────

  describe('guild stats (no raid_id)', () => {
    it('should display guild stats with default period (month)', async () => {
      const raids = [
        makeRaid({ id: 'raid-1', raidDate: new Date() }),
        makeRaid({ id: 'raid-2', raidDate: new Date(), attendance: makeAttendance() }),
      ];
      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      const interaction = buildMockInteraction();

      await command.execute(interaction);

      expect(prisma.raid.findMany).toHaveBeenCalledTimes(1);
      const findManyArgs = (prisma.raid.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyArgs.where.guildId).toBe('guild-123');
      expect(findManyArgs.include.attendance).toBe(true);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.title).toContain('Last 30 days');

      const fieldNames = embed.data.fields.map((f: any) => f.name);
      expect(fieldNames).toContain('Total Raids');
      expect(fieldNames).toContain('Attendance Rate');
      expect(fieldNames).toContain('Total Raiders');
      expect(fieldNames).toContain('Top Attendees');
    });

    it('should filter by week period', async () => {
      const raids = [makeRaid()];
      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      const interaction = buildMockInteraction({
        period: { value: 'week' },
      });

      await command.execute(interaction);

      const findManyArgs = (prisma.raid.findMany as jest.Mock).mock.calls[0][0];
      const startDate = findManyArgs.where.raidDate.gte;
      const daysDiff = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeCloseTo(7, 0);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.title).toContain('Last 7 days');
    });

    it('should filter by all-time period', async () => {
      const raids = [makeRaid()];
      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      const interaction = buildMockInteraction({
        period: { value: 'all' },
      });

      await command.execute(interaction);

      const findManyArgs = (prisma.raid.findMany as jest.Mock).mock.calls[0][0];
      const startDate = findManyArgs.where.raidDate.gte;
      // All-time uses epoch start
      expect(startDate.getTime()).toBe(0);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.title).toContain('All time');
    });

    it('should return message when no raids found', async () => {
      (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);

      const interaction = buildMockInteraction();

      await command.execute(interaction);

      const reply = interaction.editReply.mock.calls[0][0];
      expect(reply.content).toBe('No raids found for this period.');
    });

    it('should show top attendees with reliability scores', async () => {
      const raids = [
        makeRaid({ id: 'r1' }),
        makeRaid({ id: 'r2' }),
      ];
      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      const interaction = buildMockInteraction();

      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      const topField = embed.data.fields.find((f: any) => f.name === 'Top Attendees');

      expect(topField).toBeDefined();
      // Should have numbered list with player names
      expect(topField.value).toContain('1.');
      expect(topField.value).toContain('Player');
    });

    it('should show class distribution across raids', async () => {
      const raids = [makeRaid({ id: 'r1' })];
      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      const interaction = buildMockInteraction();

      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      const classField = embed.data.fields.find((f: any) => f.name === 'Class Distribution');

      expect(classField).toBeDefined();
      expect(classField.value).toContain('Warrior');
    });

    it('should use German translations for guild stats', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'guild-123',
        language: 'de',
        timezoneOffset: 0,
      });

      const raids = [makeRaid()];
      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      const interaction = buildMockInteraction({
        period: { value: 'month' },
      });

      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.title).toContain('Server-Statistiken');
      expect(embed.data.title).toContain('Letzte 30 Tage');

      const fieldNames = embed.data.fields.map((f: any) => f.name);
      expect(fieldNames).toContain('Raids insgesamt');
      expect(fieldNames).toContain('Teilnahmequote');
    });
  });

  // ── Embed Formatting ────────────────────────────────────────

  describe('embed formatting', () => {
    it('should use green embed color for high attendance single raid', async () => {
      // All attending = 100% => green
      const allAttending = [
        { id: 'a1', raidId: 'raid-1', userId: 'u1', guildId: 'guild-123', username: 'P1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Arms' },
        { id: 'a2', raidId: 'raid-1', userId: 'u2', guildId: 'guild-123', username: 'P2', status: 'attending', wowClass: 'Mage', wowSpec: 'Fire' },
      ];
      const raid = makeRaid({ attendance: allAttending });
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

      const interaction = buildMockInteraction({ raid_id: { value: 'raid-1' } });
      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.color).toBe(0x00ae86); // green
    });

    it('should use red embed color for low attendance single raid', async () => {
      // 1 attending out of 5 = 20% => red
      const lowAttendance = [
        { id: 'a1', raidId: 'raid-1', userId: 'u1', guildId: 'guild-123', username: 'P1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Arms' },
        { id: 'a2', raidId: 'raid-1', userId: 'u2', guildId: 'guild-123', username: 'P2', status: 'opted_out', wowClass: null, wowSpec: null },
        { id: 'a3', raidId: 'raid-1', userId: 'u3', guildId: 'guild-123', username: 'P3', status: 'opted_out', wowClass: null, wowSpec: null },
        { id: 'a4', raidId: 'raid-1', userId: 'u4', guildId: 'guild-123', username: 'P4', status: 'opted_out', wowClass: null, wowSpec: null },
        { id: 'a5', raidId: 'raid-1', userId: 'u5', guildId: 'guild-123', username: 'P5', status: 'opted_out', wowClass: null, wowSpec: null },
      ];
      const raid = makeRaid({ attendance: lowAttendance });
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

      const interaction = buildMockInteraction({ raid_id: { value: 'raid-1' } });
      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.color).toBe(0xff4500); // red
    });

    it('should include footer with raid ID in single raid stats', async () => {
      const raid = makeRaid({ id: 'my-unique-raid-123' });
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

      const interaction = buildMockInteraction({ raid_id: { value: 'my-unique-raid-123' } });
      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.footer.text).toBe('Raid ID: my-unique-raid-123');
    });

    it('should filter guild stats by month period date range', async () => {
      const raids = [makeRaid()];
      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      const interaction = buildMockInteraction({ period: { value: 'month' } });
      await command.execute(interaction);

      const findManyArgs = (prisma.raid.findMany as jest.Mock).mock.calls[0][0];
      const startDate = findManyArgs.where.raidDate.gte;
      const daysDiff = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeCloseTo(30, 0);
    });
  });

  // ── Error Cases ─────────────────────────────────────────────

  describe('error cases', () => {
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
});
