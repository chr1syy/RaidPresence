/**
 * Phase 1 Integration Tests
 *
 * End-to-end test scenarios that verify multi-command workflows:
 * 1. Create raid → Clone raid → Verify composition
 * 2. Create raid → Get stats → Verify calculations
 * 3. Create raid → Send reminder with message → Verify message in embed
 * 4. Create 5 raids → Get status → Verify all appear, sorted correctly
 *
 * These tests use mocked Discord interactions and Prisma to exercise
 * the full command handler pipeline for each feature.
 */

import { canManageRaids } from '../../../utils/permissions';

jest.mock('../../../database/client');
jest.mock('../../../utils/permissions');

import prisma from '../../../database/client';
import command from '../../raid';

// ─── Shared Helpers ───────────────────────────────────────────────

/**
 * Minimal Collection-like Map supporting discord.js .some(), .filter(), .find()
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

/** Future date string N days from now */
function futureDateStr(daysFromNow = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

/** Standard guild data */
const guildData = {
  id: 'guild-int',
  name: 'Integration Guild',
  language: 'en',
  timezoneOffset: 0,
  raidLeaderRoles: 'role-leader',
  raidRoles: 'role-raider',
};

/** Standard attendance factory */
function makeAttendanceRecords(raidId: string, count = 5) {
  const statuses = ['attending', 'attending', 'attending', 'opted_out', 'late'];
  const classes = [
    { wowClass: 'Warrior', wowSpec: 'Protection' },
    { wowClass: 'Priest', wowSpec: 'Holy' },
    { wowClass: 'Mage', wowSpec: 'Fire' },
    { wowClass: 'Rogue', wowSpec: 'Assassination' },
    { wowClass: 'Hunter', wowSpec: 'Beast Mastery' },
  ];
  return Array.from({ length: count }, (_, i) => ({
    id: `att-${raidId}-${i}`,
    raidId,
    userId: `user-${i + 1}`,
    guildId: 'guild-int',
    username: `Player${i + 1}`,
    status: statuses[i % statuses.length],
    wowClass: classes[i % classes.length].wowClass,
    wowSpec: classes[i % classes.length].wowSpec,
  }));
}

/** Build guild members cache with roles */
function buildMembersCache() {
  const memberRolesCache = new MockCollection<string, any>();
  memberRolesCache.set('role-raider', { id: 'role-raider', name: 'Raider' });

  const membersCache = new Map<string, any>();
  for (let i = 1; i <= 5; i++) {
    membersCache.set(`user-${i}`, {
      user: { bot: false, id: `user-${i}` },
      displayName: `Player${i}`,
      roles: { cache: memberRolesCache },
    });
  }
  // Add a bot to verify bots are excluded
  membersCache.set('bot-1', {
    user: { bot: true, id: 'bot-1' },
    displayName: 'BotUser',
    roles: { cache: memberRolesCache },
  });
  return membersCache;
}

// ─── Test Suite ───────────────────────────────────────────────────

describe('Phase 1 Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (canManageRaids as jest.Mock).mockResolvedValue(true);
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ ...guildData });
  });

  // ═══════════════════════════════════════════════════════════════
  // 1. Create raid → Clone raid → Verify composition
  // ═══════════════════════════════════════════════════════════════
  describe('Scenario 1: Create → Clone → Verify composition', () => {
    it('should clone a raid preserving roles and create fresh attendance for eligible members', async () => {
      // ── Step 1: Simulate an existing "created" raid ────────────
      const sourceRaidDate = new Date('2026-04-01T18:00:00Z');
      const sourceRaid = {
        id: 'src-raid-1',
        guildId: 'guild-int',
        channelId: 'channel-int',
        raidDate: sourceRaidDate,
        description: 'Original Mythic Run',
        roles: 'role-raider',
        status: 'open',
        createdBy: 'user-leader',
        messageId: 'msg-original',
        createdFromTemplateId: null,
        clonedAt: null,
        templateName: null,
        isTemplate: false,
        templateVersion: 1,
        guild: { ...guildData },
      };

      const clonedRaidId = 'cloned-raid-1';
      const cloneDate = futureDateStr(14);

      // findUnique call 1: handleCloneRaid looks up source raid
      // findUnique call 2: createRaidEmbed looks up newly created raid
      (prisma.raid.findUnique as jest.Mock)
        .mockResolvedValueOnce(sourceRaid)
        .mockResolvedValueOnce({
          id: clonedRaidId,
          guildId: 'guild-int',
          channelId: 'channel-int',
          raidDate: new Date(`${cloneDate}T18:00:00`),
          description: 'Original Mythic Run',
          roles: 'role-raider',
          createdBy: 'user-leader',
          status: 'open',
          messageId: null,
          guild: { ...guildData },
          attendance: makeAttendanceRecords(clonedRaidId, 5).map((a) => ({
            ...a,
            status: 'attending',
          })),
        });

      (prisma.raid.create as jest.Mock).mockResolvedValue({
        id: clonedRaidId,
        guildId: 'guild-int',
        channelId: 'channel-int',
        raidDate: new Date(`${cloneDate}T18:00:00`),
        description: 'Original Mythic Run',
        roles: 'role-raider',
        createdBy: 'user-leader',
        createdFromTemplateId: 'src-raid-1',
        clonedAt: new Date(),
        status: 'open',
        messageId: null,
      });
      (prisma.raid.update as jest.Mock).mockResolvedValue({});
      (prisma.raidAttendance.createMany as jest.Mock).mockResolvedValue({ count: 5 });
      (prisma.userPreference.upsert as jest.Mock).mockResolvedValue({});
      (prisma.userPreference.findMany as jest.Mock).mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({
          userId: `user-${i + 1}`,
          guildId: 'guild-int',
          username: `Player${i + 1}`,
          wowClass: ['Warrior', 'Priest', 'Mage', 'Rogue', 'Hunter'][i],
          wowSpec: ['Protection', 'Holy', 'Fire', 'Assassination', 'Beast Mastery'][i],
        }))
      );

      // ── Step 2: Execute clone command ──────────────────────────
      const sentMessage = { id: 'msg-cloned-123' };
      const membersCache = buildMembersCache();

      const cloneInteraction: any = {
        isChatInputCommand: jest.fn().mockReturnValue(true),
        guild: {
          id: 'guild-int',
          name: 'Integration Guild',
          members: { cache: membersCache, fetch: jest.fn().mockResolvedValue(undefined) },
          roles: { cache: new Map() },
        },
        channel: {
          id: 'channel-int',
          isTextBased: jest.fn().mockReturnValue(true),
          send: jest.fn().mockResolvedValue(sentMessage),
        },
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
            fetch: jest.fn().mockResolvedValue({
              isTextBased: jest.fn().mockReturnValue(true),
              messages: { fetch: jest.fn() },
            }),
          },
        },
        options: {
          getSubcommand: jest.fn().mockReturnValue('clone'),
          get: jest.fn((key: string, required?: boolean) => {
            const opts: Record<string, any> = {
              raid_id: { value: 'src-raid-1' },
              date: { value: cloneDate },
              time: undefined,
              title: undefined,
            };
            return opts[key] || (required ? { value: null } : undefined);
          }),
        },
      };

      await command.execute(cloneInteraction);

      // ── Step 3: Verify results ──────────────────────────────────

      // 3a: Source raid was looked up with guild data
      expect(prisma.raid.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'src-raid-1' },
          include: { guild: true },
        })
      );

      // 3b: New raid was created with source raid's roles preserved
      expect(prisma.raid.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            guildId: 'guild-int',
            roles: 'role-raider',
            createdFromTemplateId: 'src-raid-1',
            description: 'Original Mythic Run',
          }),
        })
      );

      // 3c: Attendance was created for eligible members (5 non-bot members)
      const createManyCall = (prisma.raidAttendance.createMany as jest.Mock).mock.calls[0][0];
      expect(createManyCall.data).toHaveLength(5);
      // All attendance should be "attending" (fresh status)
      createManyCall.data.forEach((record: any) => {
        expect(record.status).toBe('attending');
        expect(record.raidId).toBe(clonedRaidId);
        expect(record.guildId).toBe('guild-int');
      });

      // 3d: Each eligible member got a UserPreference upsert
      expect(prisma.userPreference.upsert).toHaveBeenCalledTimes(5);

      // 3e: Embed was posted to channel
      expect(cloneInteraction.channel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
        })
      );

      // 3f: Raid was updated with message ID
      expect(prisma.raid.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: clonedRaidId },
          data: { messageId: 'msg-cloned-123' },
        })
      );

      // 3g: Success message sent
      const replyContent = cloneInteraction.editReply.mock.calls[0][0].content;
      expect(replyContent).toContain('Original Mythic Run');
      expect(replyContent).toContain(cloneDate);
      expect(replyContent).toContain('5');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 2. Create raid → Get stats → Verify calculations
  // ═══════════════════════════════════════════════════════════════
  describe('Scenario 2: Create → Stats → Verify calculations', () => {
    it('should display accurate stats for a raid with mixed attendance', async () => {
      // ── Step 1: Set up a raid with known attendance ─────────────
      const raidId = 'stats-raid-1';
      const attendance = [
        { id: 'a1', raidId, userId: 'u1', guildId: 'guild-int', username: 'Tank1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' },
        { id: 'a2', raidId, userId: 'u2', guildId: 'guild-int', username: 'Healer1', status: 'attending', wowClass: 'Priest', wowSpec: 'Holy' },
        { id: 'a3', raidId, userId: 'u3', guildId: 'guild-int', username: 'DPS1', status: 'attending', wowClass: 'Mage', wowSpec: 'Fire' },
        { id: 'a4', raidId, userId: 'u4', guildId: 'guild-int', username: 'DPS2', status: 'attending', wowClass: 'Hunter', wowSpec: 'Beast Mastery' },
        { id: 'a5', raidId, userId: 'u5', guildId: 'guild-int', username: 'Absent1', status: 'opted_out', wowClass: 'Rogue', wowSpec: 'Assassination' },
        { id: 'a6', raidId, userId: 'u6', guildId: 'guild-int', username: 'Late1', status: 'late', wowClass: 'Druid', wowSpec: 'Restoration' },
        { id: 'a7', raidId, userId: 'u7', guildId: 'guild-int', username: 'Absent2', status: 'opted_out', wowClass: 'Warlock', wowSpec: 'Destruction' },
        { id: 'a8', raidId, userId: 'u8', guildId: 'guild-int', username: 'DPS3', status: 'attending', wowClass: 'Death Knight', wowSpec: 'Frost' },
        { id: 'a9', raidId, userId: 'u9', guildId: 'guild-int', username: 'NoClass', status: 'attending', wowClass: null, wowSpec: null },
        { id: 'a10', raidId, userId: 'u10', guildId: 'guild-int', username: 'Absent3', status: 'opted_out', wowClass: 'Paladin', wowSpec: 'Holy' },
      ];
      // Expected: 6 attending, 3 opted_out, 1 late = 6/10 = 60% attendance

      const raid = {
        id: raidId,
        guildId: 'guild-int',
        channelId: 'channel-int',
        raidDate: new Date('2026-04-15T19:00:00Z'),
        description: 'Heroic Progression',
        roles: 'role-raider',
        status: 'open',
        createdBy: 'user-leader',
        messageId: 'msg-stats',
        attendance,
      };

      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

      // ── Step 2: Execute stats command for single raid ───────────
      const statsInteraction: any = {
        isChatInputCommand: jest.fn().mockReturnValue(true),
        guild: { id: 'guild-int', name: 'Integration Guild' },
        channel: { id: 'channel-int' },
        member: { user: { bot: false, id: 'user-leader' }, roles: { cache: new Map() } },
        user: { id: 'user-leader' },
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
        reply: jest.fn().mockResolvedValue(undefined),
        options: {
          getSubcommand: jest.fn().mockReturnValue('stats'),
          get: jest.fn((key: string, required?: boolean) => {
            const opts: Record<string, any> = {
              raid_id: { value: raidId },
              period: undefined,
            };
            return opts[key] || (required ? { value: null } : undefined);
          }),
        },
      };

      await command.execute(statsInteraction);

      // ── Step 3: Verify stats calculations ──────────────────────
      expect(statsInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });

      const replyArg = statsInteraction.editReply.mock.calls[0][0];
      expect(replyArg.embeds).toBeDefined();
      expect(replyArg.embeds).toHaveLength(1);

      const embed = replyArg.embeds[0];
      const fields = embed.data.fields;

      // Title contains raid name
      expect(embed.data.title).toContain('Heroic Progression');

      // Attendance rate: 6/10 = 60%
      const attendanceField = fields.find((f: any) => f.name === 'Attendance Rate');
      expect(attendanceField).toBeDefined();
      expect(attendanceField.value).toContain('6/10');
      expect(attendanceField.value).toContain('60');

      // Counts
      const attendingField = fields.find((f: any) => f.name === 'Attending');
      expect(attendingField.value).toBe('6');

      const optedOutField = fields.find((f: any) => f.name === 'Opted Out');
      expect(optedOutField.value).toBe('3');

      const lateField = fields.find((f: any) => f.name === 'Running Late');
      expect(lateField.value).toBe('1');

      // Role composition (from attending + late):
      // Tank: Warrior/Prot(1), Healer: Priest/Holy(1) + Druid/Resto(1)=2,
      // Ranged: Mage/Fire(1) + Hunter/BM(1) + Warlock/Dest... no, warlock is opted_out
      // Active: u1(Tank), u2(Healer), u3(Ranged), u4(Ranged), u6(Healer-late), u8(Melee-DK/Frost), u9(noClass)
      const compField = fields.find((f: any) => f.name === 'Role Composition');
      expect(compField).toBeDefined();
      expect(compField.value).toContain('Tank: 1');
      expect(compField.value).toContain('Heal: 2');

      // Class distribution should list present classes
      const classField = fields.find((f: any) => f.name === 'Class Distribution');
      expect(classField).toBeDefined();
      expect(classField.value).toContain('Warrior');
      expect(classField.value).toContain('Priest');
      expect(classField.value).toContain('Mage');

      // Color should be yellow (50-79%)
      expect(embed.data.color).toBe(0xffd700);

      // Footer should have raid ID
      expect(embed.data.footer.text).toContain(raidId);
    });

    it('should display accurate guild-wide stats across multiple raids', async () => {
      // ── Step 1: Set up multiple raids with varying attendance ───
      const raids = [
        {
          id: 'gr-1',
          guildId: 'guild-int',
          channelId: 'channel-int',
          raidDate: new Date(),
          description: 'Raid 1',
          roles: 'role-raider',
          status: 'open',
          createdBy: 'user-leader',
          messageId: 'msg-1',
          attendance: [
            { id: 'ga1', raidId: 'gr-1', userId: 'u1', guildId: 'guild-int', username: 'Player1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Arms' },
            { id: 'ga2', raidId: 'gr-1', userId: 'u2', guildId: 'guild-int', username: 'Player2', status: 'attending', wowClass: 'Mage', wowSpec: 'Fire' },
            { id: 'ga3', raidId: 'gr-1', userId: 'u3', guildId: 'guild-int', username: 'Player3', status: 'opted_out', wowClass: null, wowSpec: null },
          ],
        },
        {
          id: 'gr-2',
          guildId: 'guild-int',
          channelId: 'channel-int',
          raidDate: new Date(),
          description: 'Raid 2',
          roles: 'role-raider',
          status: 'open',
          createdBy: 'user-leader',
          messageId: 'msg-2',
          attendance: [
            { id: 'ga4', raidId: 'gr-2', userId: 'u1', guildId: 'guild-int', username: 'Player1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Arms' },
            { id: 'ga5', raidId: 'gr-2', userId: 'u2', guildId: 'guild-int', username: 'Player2', status: 'opted_out', wowClass: null, wowSpec: null },
            { id: 'ga6', raidId: 'gr-2', userId: 'u3', guildId: 'guild-int', username: 'Player3', status: 'attending', wowClass: 'Priest', wowSpec: 'Holy' },
          ],
        },
      ];

      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      // ── Step 2: Execute guild stats command ─────────────────────
      const guildStatsInteraction: any = {
        isChatInputCommand: jest.fn().mockReturnValue(true),
        guild: { id: 'guild-int', name: 'Integration Guild' },
        channel: { id: 'channel-int' },
        member: { user: { bot: false, id: 'user-leader' }, roles: { cache: new Map() } },
        user: { id: 'user-leader' },
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
        reply: jest.fn().mockResolvedValue(undefined),
        options: {
          getSubcommand: jest.fn().mockReturnValue('stats'),
          get: jest.fn((key: string, required?: boolean) => {
            const opts: Record<string, any> = {
              raid_id: undefined,
              period: { value: 'month' },
            };
            return opts[key] || (required ? { value: null } : undefined);
          }),
        },
      };

      await command.execute(guildStatsInteraction);

      // ── Step 3: Verify guild stats ──────────────────────────────
      const replyArg = guildStatsInteraction.editReply.mock.calls[0][0];
      expect(replyArg.embeds).toBeDefined();
      expect(replyArg.embeds).toHaveLength(1);

      const embed = replyArg.embeds[0];
      const fields = embed.data.fields;

      // Title indicates guild stats with period
      expect(embed.data.title).toContain('Last 30 days');

      // Total raids
      const totalRaidsField = fields.find((f: any) => f.name === 'Total Raids');
      expect(totalRaidsField).toBeDefined();
      expect(totalRaidsField.value).toBe('2');

      // Total raiders (3 unique players across both raids)
      const totalRaidersField = fields.find((f: any) => f.name === 'Total Raiders');
      expect(totalRaidersField).toBeDefined();
      expect(totalRaidersField.value).toBe('3');

      // Average attendance rate: Raid1 = 2/3 (66.7%), Raid2 = 2/3 (66.7%) => avg = 66.7%
      const attendanceField = fields.find((f: any) => f.name === 'Attendance Rate');
      expect(attendanceField).toBeDefined();
      expect(attendanceField.value).toContain('66.7');

      // Top attendees should be present
      const topField = fields.find((f: any) => f.name === 'Top Attendees');
      expect(topField).toBeDefined();
      // Player1 attended both raids (100%), Player2 attended 1/2 (50%), Player3 attended 1/2 (50%)
      expect(topField.value).toContain('Player1');
      expect(topField.value).toContain('100%');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 3. Create raid → Send reminder with message → Verify embed
  // ═══════════════════════════════════════════════════════════════
  describe('Scenario 3: Create → Remind with custom message → Verify embed', () => {
    it('should send reminder with custom message and show opted-out players', async () => {
      // ── Step 1: Set up a raid with mixed attendance ─────────────
      const raid = {
        id: 'remind-raid-1',
        guildId: 'guild-int',
        channelId: 'channel-int',
        raidDate: new Date('2026-05-10T19:30:00Z'),
        description: 'Weekly Clear',
        roles: 'role-raider',
        status: 'open',
        createdBy: 'user-leader',
        messageId: 'msg-remind',
        guild: { ...guildData },
        attendance: [
          { id: 'ra1', userId: 'user-1', username: 'TankMain', status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' },
          { id: 'ra2', userId: 'user-2', username: 'HealerMain', status: 'attending', wowClass: 'Priest', wowSpec: 'Holy' },
          { id: 'ra3', userId: 'user-3', username: 'AbsentDPS', status: 'opted_out', wowClass: 'Mage', wowSpec: 'Fire' },
          { id: 'ra4', userId: 'user-4', username: 'LateDPS', status: 'late', wowClass: 'Rogue', wowSpec: 'Assassination' },
          { id: 'ra5', userId: 'user-5', username: 'AbsentHealer', status: 'opted_out', wowClass: 'Druid', wowSpec: 'Restoration' },
        ],
      };

      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

      // ── Step 2: Execute remind command with custom message ─────
      const rolesCache = new MockCollection<string, any>();
      rolesCache.set('role-raider', { id: 'role-raider', name: 'Raider' });

      const mockChannel = {
        id: 'channel-int',
        isTextBased: jest.fn().mockReturnValue(true),
        send: jest.fn().mockResolvedValue({ id: 'msg-reminder-new' }),
      };

      const customMessage = 'Bring 20 stacks of potions and enchanted gear. We are progressing tonight!';

      const remindInteraction: any = {
        isChatInputCommand: jest.fn().mockReturnValue(true),
        guild: {
          id: 'guild-int',
          name: 'Integration Guild',
          members: { cache: new Map(), fetch: jest.fn().mockResolvedValue(undefined) },
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
            const opts: Record<string, any> = {
              raid_id: { value: 'remind-raid-1' },
              message: { value: customMessage },
            };
            return opts[key] || (required ? { value: null } : undefined);
          }),
        },
      };

      await command.execute(remindInteraction);

      // ── Step 3: Verify reminder embed ──────────────────────────
      // 3a: Channel.send was called
      expect(mockChannel.send).toHaveBeenCalledTimes(1);

      const sendCall = mockChannel.send.mock.calls[0][0];
      const embed = sendCall.embeds[0];

      // 3b: Embed title is reminder
      expect(embed.data.title).toBe('🔔 Raid Reminder');

      // 3c: Description contains raid info
      expect(embed.data.description).toContain('Weekly Clear');

      // 3d: Custom message field exists with correct content
      const customField = embed.data.fields?.find(
        (f: any) => f.name.includes('Message from Raid Leader')
      );
      expect(customField).toBeDefined();
      expect(customField.value).toBe(customMessage);

      // 3e: Opted-out players field shows both absent players
      const optedOutField = embed.data.fields?.find(
        (f: any) => f.name.includes('Currently Opted Out')
      );
      expect(optedOutField).toBeDefined();
      expect(optedOutField.name).toContain('(2)');
      expect(optedOutField.value).toContain('AbsentDPS');
      expect(optedOutField.value).toContain('AbsentHealer');

      // 3f: Role mentions in content
      expect(sendCall.content).toContain('<@&role-raider>');

      // 3g: Confirmation sent to command user
      expect(remindInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Weekly Clear'),
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 4. Create 5 raids → Get status → Verify sorted display
  // ═══════════════════════════════════════════════════════════════
  describe('Scenario 4: Create 5 raids → Status → Verify sorted display', () => {
    it('should display all 5 raids sorted by date with correct status indicators', async () => {
      // ── Step 1: Create 5 raids with different dates and attendance ─
      const raids = [
        {
          id: 'sr-1',
          guildId: 'guild-int',
          channelId: 'channel-int',
          raidDate: new Date('2026-03-10T18:00:00Z'),
          description: 'Monday Raid',
          roles: 'role-raider',
          status: 'open',
          createdBy: 'user-leader',
          messageId: 'msg-sr1',
          attendance: Array.from({ length: 10 }, (_, i) => ({
            id: `sr1-a${i}`, raidId: 'sr-1', userId: `u${i}`, guildId: 'guild-int',
            username: `P${i}`, status: 'attending', wowClass: 'Warrior', wowSpec: 'Arms',
          })),
          // 10/10 = 100% → FULL
        },
        {
          id: 'sr-2',
          guildId: 'guild-int',
          channelId: 'channel-int',
          raidDate: new Date('2026-03-12T18:00:00Z'),
          description: 'Wednesday Raid',
          roles: 'role-raider',
          status: 'open',
          createdBy: 'user-leader',
          messageId: 'msg-sr2',
          attendance: [
            ...Array.from({ length: 7 }, (_, i) => ({
              id: `sr2-a${i}`, raidId: 'sr-2', userId: `u${i}`, guildId: 'guild-int',
              username: `P${i}`, status: 'attending', wowClass: 'Mage', wowSpec: 'Fire',
            })),
            ...Array.from({ length: 3 }, (_, i) => ({
              id: `sr2-o${i}`, raidId: 'sr-2', userId: `uo${i}`, guildId: 'guild-int',
              username: `PO${i}`, status: 'opted_out', wowClass: null, wowSpec: null,
            })),
          ],
          // 7/10 = 70% → GOOD
        },
        {
          id: 'sr-3',
          guildId: 'guild-int',
          channelId: 'channel-int',
          raidDate: new Date('2026-03-14T18:00:00Z'),
          description: 'Friday Raid',
          roles: 'role-raider',
          status: 'open',
          createdBy: 'user-leader',
          messageId: 'msg-sr3',
          attendance: [
            { id: 'sr3-a1', raidId: 'sr-3', userId: 'u1', guildId: 'guild-int', username: 'P1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Arms' },
            ...Array.from({ length: 9 }, (_, i) => ({
              id: `sr3-o${i}`, raidId: 'sr-3', userId: `uo${i}`, guildId: 'guild-int',
              username: `PO${i}`, status: 'opted_out', wowClass: null, wowSpec: null,
            })),
          ],
          // 1/10 = 10% → LOW
        },
        {
          id: 'sr-4',
          guildId: 'guild-int',
          channelId: 'channel-int',
          raidDate: new Date('2026-03-17T18:00:00Z'),
          description: 'Monday Alt Raid',
          roles: 'role-raider',
          status: 'open',
          createdBy: 'user-leader',
          messageId: 'msg-sr4',
          attendance: Array.from({ length: 8 }, (_, i) => ({
            id: `sr4-a${i}`, raidId: 'sr-4', userId: `u${i}`, guildId: 'guild-int',
            username: `P${i}`, status: i < 7 ? 'attending' : 'late',
            wowClass: 'Priest', wowSpec: 'Holy',
          })),
          // 8/8 = 100% (attending + late) → FULL
        },
        {
          id: 'sr-5',
          guildId: 'guild-int',
          channelId: 'channel-int',
          raidDate: new Date('2026-03-20T18:00:00Z'),
          description: 'Thursday Progression',
          roles: 'role-raider',
          status: 'open',
          createdBy: 'user-leader',
          messageId: 'msg-sr5',
          attendance: [
            ...Array.from({ length: 5 }, (_, i) => ({
              id: `sr5-a${i}`, raidId: 'sr-5', userId: `u${i}`, guildId: 'guild-int',
              username: `P${i}`, status: 'attending', wowClass: 'Hunter', wowSpec: 'Beast Mastery',
            })),
            ...Array.from({ length: 5 }, (_, i) => ({
              id: `sr5-o${i}`, raidId: 'sr-5', userId: `uo${i}`, guildId: 'guild-int',
              username: `PO${i}`, status: 'opted_out', wowClass: null, wowSpec: null,
            })),
          ],
          // 5/10 = 50% → GOOD
        },
      ];

      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      // ── Step 2: Execute status command ──────────────────────────
      const statusInteraction: any = {
        isChatInputCommand: jest.fn().mockReturnValue(true),
        guild: { id: 'guild-int', name: 'Integration Guild' },
        channel: { id: 'channel-int' },
        member: { user: { bot: false, id: 'user-leader' }, roles: { cache: new Map() } },
        user: { id: 'user-leader' },
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
        reply: jest.fn().mockResolvedValue(undefined),
        options: {
          getSubcommand: jest.fn().mockReturnValue('status'),
          get: jest.fn(() => undefined),
        },
      };

      await command.execute(statusInteraction);

      // ── Step 3: Verify status dashboard ─────────────────────────
      // 3a: Correct DB query
      expect(prisma.raid.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            guildId: 'guild-int',
            status: 'open',
          }),
          orderBy: { raidDate: 'asc' },
          take: 7,
          include: { attendance: true },
        })
      );

      const replyArg = statusInteraction.editReply.mock.calls[0][0];
      expect(replyArg.embeds).toBeDefined();
      expect(replyArg.embeds).toHaveLength(1);

      const embed = replyArg.embeds[0];
      const desc = embed.data.description;

      // 3b: All 5 raids present in description
      expect(desc).toContain('Monday Raid');
      expect(desc).toContain('Wednesday Raid');
      expect(desc).toContain('Friday Raid');
      expect(desc).toContain('Monday Alt Raid');
      expect(desc).toContain('Thursday Progression');

      // 3c: Raids are sorted chronologically (Monday < Wednesday < Friday < Monday Alt < Thursday)
      const mondayIdx = desc.indexOf('Monday Raid');
      const wednesdayIdx = desc.indexOf('Wednesday Raid');
      const fridayIdx = desc.indexOf('Friday Raid');
      const mondayAltIdx = desc.indexOf('Monday Alt Raid');
      const thursdayIdx = desc.indexOf('Thursday Progression');
      expect(mondayIdx).toBeLessThan(wednesdayIdx);
      expect(wednesdayIdx).toBeLessThan(fridayIdx);
      expect(fridayIdx).toBeLessThan(mondayAltIdx);
      expect(mondayAltIdx).toBeLessThan(thursdayIdx);

      // 3d: Correct status indicators
      expect(desc).toContain('✅ FULL');  // Monday Raid (100%) and Monday Alt Raid (100%)
      expect(desc).toContain('🟢 GOOD');  // Wednesday Raid (70%) and Thursday Progression (50%)
      expect(desc).toContain('🔴 CRITICAL');   // Friday Raid (10%)

      // 3e: Roster percentages present
      expect(desc).toContain('10/10');  // Monday Raid
      expect(desc).toContain('100%');   // Monday Raid
      expect(desc).toContain('7/10');   // Wednesday Raid
      expect(desc).toContain('70%');    // Wednesday Raid
      expect(desc).toContain('1/10');   // Friday Raid
      expect(desc).toContain('10%');    // Friday Raid

      // 3f: Embed color is red because at least one raid is CRITICAL
      expect(embed.data.color).toBe(0xff4500);

      // 3g: Title is "Upcoming Raids"
      expect(embed.data.title).toBe('Upcoming Raids');
    });
  });
});
