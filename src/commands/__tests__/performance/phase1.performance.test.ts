/**
 * Phase 1 Performance Tests
 *
 * Validates that Phase 1 features meet performance targets:
 * - Stats queries execute in <200ms
 * - Clone command completes in <2 seconds
 * - Status dashboard renders in <500ms
 * - No memory leaks with large guilds (up to 500 members / 100 raids)
 */

import { canManageRaids } from '../../../utils/permissions';

jest.mock('../../../database/client');
jest.mock('../../../utils/permissions');

import prisma from '../../../database/client';
import command from '../../raid';
import { calculateRaidStats, calculateGuildStats } from '../../../utils/statsCalculator';
import { formatStatusEmbed, StatusRaid } from '../../../utils/statusFormatter';
import { formatRaidStatsEmbed, formatGuildStatsEmbed } from '../../../utils/statsFormatter';

// ─── Helpers ──────────────────────────────────────────────────────

const WOW_CLASSES = [
  'Death Knight', 'Demon Hunter', 'Druid', 'Evoker', 'Hunter',
  'Mage', 'Monk', 'Paladin', 'Priest', 'Rogue',
  'Shaman', 'Warlock', 'Warrior',
];

const WOW_SPECS: Record<string, string[]> = {
  'Death Knight': ['Blood', 'Frost', 'Unholy'],
  'Demon Hunter': ['Havoc', 'Vengeance'],
  'Druid': ['Balance', 'Feral', 'Guardian', 'Restoration'],
  'Evoker': ['Devastation', 'Preservation', 'Augmentation'],
  'Hunter': ['Beast Mastery', 'Marksmanship', 'Survival'],
  'Mage': ['Arcane', 'Fire', 'Frost'],
  'Monk': ['Brewmaster', 'Mistweaver', 'Windwalker'],
  'Paladin': ['Holy', 'Protection', 'Retribution'],
  'Priest': ['Discipline', 'Holy', 'Shadow'],
  'Rogue': ['Assassination', 'Outlaw', 'Subtlety'],
  'Shaman': ['Elemental', 'Enhancement', 'Restoration'],
  'Warlock': ['Affliction', 'Demonology', 'Destruction'],
  'Warrior': ['Arms', 'Fury', 'Protection'],
};

const STATUSES = ['attending', 'attending', 'attending', 'opted_out', 'late'] as const;

/** Generate N attendance records with realistic WoW class/spec distribution */
function generateAttendance(count: number, raidId = 'perf-raid') {
  return Array.from({ length: count }, (_, i) => {
    const wowClass = WOW_CLASSES[i % WOW_CLASSES.length];
    const specs = WOW_SPECS[wowClass];
    const wowSpec = specs[i % specs.length];
    return {
      id: `att-${raidId}-${i}`,
      raidId,
      userId: `user-${i}`,
      guildId: 'guild-perf',
      username: `Player${i}`,
      status: STATUSES[i % STATUSES.length],
      wowClass,
      wowSpec,
    };
  });
}

/** Generate N raids, each with `membersPerRaid` attendance records */
function generateRaids(count: number, membersPerRaid: number) {
  return Array.from({ length: count }, (_, i) => {
    const raidId = `raid-${i}`;
    return {
      id: raidId,
      guildId: 'guild-perf',
      channelId: 'channel-perf',
      raidDate: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000),
      description: `Performance Raid ${i + 1}`,
      roles: 'role-raider',
      status: 'open',
      createdBy: 'user-leader',
      messageId: `msg-${i}`,
      guild: {
        id: 'guild-perf',
        language: 'en',
        timezoneOffset: 0,
      },
      attendance: generateAttendance(membersPerRaid, raidId),
    };
  });
}

/** Minimal MockCollection for discord.js cache compatibility */
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

function futureDateStr(daysFromNow = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

/** Measure execution time of an async function in ms */
async function measureTime(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

/** Measure execution time of a sync function in ms */
function measureTimeSync(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

/** Get current heap usage in MB */
function getHeapMB(): number {
  if (global.gc) global.gc();
  return process.memoryUsage().heapUsed / (1024 * 1024);
}

// ─── Tests ────────────────────────────────────────────────────────

describe('Phase 1 Performance Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (canManageRaids as jest.Mock).mockResolvedValue(true);
  });

  // ── Stats Performance ──────────────────────────────────

  describe('Stats queries execute in <200ms', () => {
    it('should calculate single raid stats for 200 members in <200ms', () => {
      const attendance = generateAttendance(200).map(a => ({
        userId: a.userId,
        username: a.username,
        status: a.status,
        wowClass: a.wowClass,
        wowSpec: a.wowSpec,
      }));

      const elapsed = measureTimeSync(() => {
        calculateRaidStats(attendance);
      });

      expect(elapsed).toBeLessThan(200);
    });

    it('should calculate single raid stats for 500 members in <200ms', () => {
      const attendance = generateAttendance(500).map(a => ({
        userId: a.userId,
        username: a.username,
        status: a.status,
        wowClass: a.wowClass,
        wowSpec: a.wowSpec,
      }));

      const elapsed = measureTimeSync(() => {
        calculateRaidStats(attendance);
      });

      expect(elapsed).toBeLessThan(200);
    });

    it('should calculate guild stats for 50 raids × 30 members in <200ms', () => {
      const raids = generateRaids(50, 30).map(r => ({
        id: r.id,
        attendance: r.attendance.map(a => ({
          userId: a.userId,
          username: a.username,
          status: a.status,
          wowClass: a.wowClass,
          wowSpec: a.wowSpec,
        })),
      }));

      const elapsed = measureTimeSync(() => {
        calculateGuildStats(raids);
      });

      expect(elapsed).toBeLessThan(200);
    });

    it('should calculate guild stats for 100 raids × 25 members in <200ms', () => {
      const raids = generateRaids(100, 25).map(r => ({
        id: r.id,
        attendance: r.attendance.map(a => ({
          userId: a.userId,
          username: a.username,
          status: a.status,
          wowClass: a.wowClass,
          wowSpec: a.wowSpec,
        })),
      }));

      const elapsed = measureTimeSync(() => {
        calculateGuildStats(raids);
      });

      expect(elapsed).toBeLessThan(200);
    });

    it('should format raid stats embed in <200ms', () => {
      const attendance = generateAttendance(200).map(a => ({
        userId: a.userId,
        username: a.username,
        status: a.status,
        wowClass: a.wowClass,
        wowSpec: a.wowSpec,
      }));
      const stats = calculateRaidStats(attendance);

      const elapsed = measureTimeSync(() => {
        formatRaidStatsEmbed({ id: 'perf-raid', description: 'Perf Raid' }, stats, 'en');
      });

      expect(elapsed).toBeLessThan(200);
    });

    it('should format guild stats embed in <200ms', () => {
      const raids = generateRaids(50, 30).map(r => ({
        id: r.id,
        attendance: r.attendance.map(a => ({
          userId: a.userId,
          username: a.username,
          status: a.status,
          wowClass: a.wowClass,
          wowSpec: a.wowSpec,
        })),
      }));
      const guildStats = calculateGuildStats(raids);

      const elapsed = measureTimeSync(() => {
        formatGuildStatsEmbed(guildStats, 'month', 'en');
      });

      expect(elapsed).toBeLessThan(200);
    });

    it('should execute full stats command handler in <200ms', async () => {
      const raids = generateRaids(50, 25);
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'guild-perf',
        language: 'en',
        timezoneOffset: 0,
      });
      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      const interaction: any = {
        isChatInputCommand: jest.fn().mockReturnValue(true),
        guild: { id: 'guild-perf', name: 'Perf Guild' },
        channel: { id: 'channel-perf' },
        member: { user: { bot: false, id: 'user-leader' }, roles: { cache: new Map() } },
        user: { id: 'user-leader' },
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
        reply: jest.fn().mockResolvedValue(undefined),
        options: {
          getSubcommand: jest.fn().mockReturnValue('stats'),
          get: jest.fn((key: string) => {
            if (key === 'period') return { value: 'month' };
            return undefined;
          }),
        },
      };

      const elapsed = await measureTime(async () => {
        await command.execute(interaction);
      });

      expect(elapsed).toBeLessThan(200);
      expect(interaction.editReply).toHaveBeenCalled();
    });
  });

  // ── Clone Performance ──────────────────────────────────

  describe('Clone command completes in <2 seconds', () => {
    function buildCloneMocks(memberCount: number) {
      const membersCache = new MockCollection<string, any>();
      const rolesCache = new MockCollection<string, any>();
      rolesCache.set('role-raider', { id: 'role-raider', name: 'Raider' });

      for (let i = 0; i < memberCount; i++) {
        const memberRolesCache = new MockCollection<string, any>();
        memberRolesCache.set('role-raider', { id: 'role-raider', name: 'Raider' });
        membersCache.set(`user-${i}`, {
          user: { bot: false, id: `user-${i}` },
          displayName: `Player${i}`,
          roles: { cache: memberRolesCache },
        });
      }

      const sentMessage = { id: 'msg-new' };

      const sourceRaid = {
        id: 'source-raid',
        guildId: 'guild-perf',
        channelId: 'channel-perf',
        raidDate: new Date('2026-03-01T18:00:00Z'),
        description: 'Source Raid',
        roles: 'role-raider',
        status: 'open',
        createdBy: 'user-leader',
        messageId: 'msg-src',
        createdFromTemplateId: null,
        clonedAt: null,
        templateName: null,
        isTemplate: false,
        templateVersion: 1,
        guild: {
          id: 'guild-perf',
          language: 'en',
          timezoneOffset: 0,
          raidLeaderRoles: 'role-leader',
        },
      };

      const createdRaid = {
        id: 'new-raid-perf',
        guildId: 'guild-perf',
        channelId: 'channel-perf',
        raidDate: new Date('2026-04-01T18:00:00Z'),
        description: 'Source Raid',
        roles: 'role-raider',
        status: 'open',
        createdBy: 'user-leader',
        messageId: null,
      };

      // The second findUnique is for createRaidEmbed which builds embed fields per player.
      // Discord embeds have a 1024-char limit per field, so cap attendance at 20 for embed.
      // This still tests the full clone pipeline (all N members processed for upsert/attendance).
      const embedAttendanceCount = Math.min(memberCount, 20);
      (prisma.raid.findUnique as jest.Mock)
        .mockResolvedValueOnce(sourceRaid) // fetch source
        .mockResolvedValueOnce({           // createRaidEmbed fetch
          ...createdRaid,
          attendance: generateAttendance(embedAttendanceCount, 'new-raid-perf'),
          guild: sourceRaid.guild,
        });
      (prisma.userPreference.upsert as jest.Mock).mockResolvedValue({});
      (prisma.userPreference.findMany as jest.Mock).mockResolvedValue(
        Array.from({ length: memberCount }, (_, i) => ({
          userId: `user-${i}`,
          guildId: 'guild-perf',
          username: `Player${i}`,
          wowClass: WOW_CLASSES[i % WOW_CLASSES.length],
          wowSpec: 'Arms',
        }))
      );
      (prisma.raid.create as jest.Mock).mockResolvedValue(createdRaid);
      (prisma.raidAttendance.createMany as jest.Mock).mockResolvedValue({ count: memberCount });
      (prisma.raid.update as jest.Mock).mockResolvedValue({ ...createdRaid, messageId: 'msg-new' });

       const dateStr = futureDateStr(30);

      const options: Record<string, any> = {
        raid_id: { value: 'source-raid' },
        date: { value: dateStr },
        time: undefined,
        title: undefined,
      };

      // Populate rolesCache with all needed roles
      rolesCache.set('role-leader', { id: 'role-leader', name: 'Raid Leader' });

      const interaction: any = {
        isChatInputCommand: jest.fn().mockReturnValue(true),
        guild: {
          id: 'guild-perf',
          name: 'Perf Guild',
          members: {
            cache: membersCache,
            fetch: jest.fn().mockResolvedValue(undefined),
          },
          roles: { cache: rolesCache },
        },
        channel: {
          id: 'channel-perf',
          send: jest.fn().mockResolvedValue(sentMessage),
        },
        member: {
          user: { bot: false, id: 'user-leader' },
          roles: { cache: new MockCollection() },
        },
        user: { id: 'user-leader' },
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
        reply: jest.fn().mockResolvedValue(undefined),
        options: {
          getSubcommand: jest.fn().mockReturnValue('clone'),
          get: jest.fn((key: string, required?: boolean) => options[key] || undefined),
        },
      };

      return interaction;
    }

    it('should clone a raid with 25 members in <2 seconds', async () => {
      const interaction = buildCloneMocks(25);

      const elapsed = await measureTime(async () => {
        await command.execute(interaction);
      });

      expect(elapsed).toBeLessThan(2000);
      expect(interaction.editReply).toHaveBeenCalled();
    });

    it('should clone a raid with 100 members in <2 seconds', async () => {
      const interaction = buildCloneMocks(100);

      const elapsed = await measureTime(async () => {
        await command.execute(interaction);
      });

      expect(elapsed).toBeLessThan(2000);
      expect(interaction.editReply).toHaveBeenCalled();
    });

    it('should clone a raid with 200 members in <2 seconds', async () => {
      const interaction = buildCloneMocks(200);

      const elapsed = await measureTime(async () => {
        await command.execute(interaction);
      });

      expect(elapsed).toBeLessThan(2000);
      expect(interaction.editReply).toHaveBeenCalled();
    });

    it('should clone a raid with 500 members in <2 seconds', async () => {
      const interaction = buildCloneMocks(500);

      const elapsed = await measureTime(async () => {
        await command.execute(interaction);
      });

      expect(elapsed).toBeLessThan(2000);
      expect(interaction.editReply).toHaveBeenCalled();
    });
  });

  // ── Status Dashboard Performance ───────────────────────

  describe('Status dashboard renders in <500ms', () => {
    it('should render status for 7 raids × 25 members in <500ms', () => {
      const raids: StatusRaid[] = generateRaids(7, 25).map(r => ({
        id: r.id,
        description: r.description,
        raidDate: r.raidDate,
        status: r.status,
        attendance: r.attendance.map(a => ({
          status: a.status,
          wowClass: a.wowClass,
          wowSpec: a.wowSpec,
        })),
      }));

      const elapsed = measureTimeSync(() => {
        formatStatusEmbed(raids, 'en');
      });

      expect(elapsed).toBeLessThan(500);
    });

    it('should render status for 7 raids × 200 members in <500ms', () => {
      const raids: StatusRaid[] = generateRaids(7, 200).map(r => ({
        id: r.id,
        description: r.description,
        raidDate: r.raidDate,
        status: r.status,
        attendance: r.attendance.map(a => ({
          status: a.status,
          wowClass: a.wowClass,
          wowSpec: a.wowSpec,
        })),
      }));

      const elapsed = measureTimeSync(() => {
        formatStatusEmbed(raids, 'en');
      });

      expect(elapsed).toBeLessThan(500);
    });

    it('should execute full status command handler in <500ms', async () => {
      const raids = generateRaids(7, 50);
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'guild-perf',
        language: 'en',
        timezoneOffset: 0,
      });
      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      const interaction: any = {
        isChatInputCommand: jest.fn().mockReturnValue(true),
        guild: { id: 'guild-perf', name: 'Perf Guild' },
        channel: { id: 'channel-perf' },
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

      const elapsed = await measureTime(async () => {
        await command.execute(interaction);
      });

      expect(elapsed).toBeLessThan(500);
      expect(interaction.editReply).toHaveBeenCalled();
    });
  });

  // ── Memory Leak Tests ──────────────────────────────────

  describe('No memory leaks with large datasets', () => {
    it('should not leak memory when calculating stats for 100 raids × 50 members', () => {
      const baseHeap = getHeapMB();

      // Run multiple iterations to detect leaks
      for (let iteration = 0; iteration < 10; iteration++) {
        const raids = Array.from({ length: 100 }, (_, i) => ({
          id: `leak-raid-${iteration}-${i}`,
          attendance: Array.from({ length: 50 }, (_, j) => ({
            userId: `user-${j}`,
            username: `Player${j}`,
            status: STATUSES[j % STATUSES.length] as string,
            wowClass: WOW_CLASSES[j % WOW_CLASSES.length],
            wowSpec: 'Arms',
          })),
        }));

        calculateGuildStats(raids);
      }

      const endHeap = getHeapMB();
      // Allow up to 50 MB growth (generous threshold for test environment GC behavior)
      const heapGrowth = endHeap - baseHeap;
      expect(heapGrowth).toBeLessThan(50);
    });

    it('should not leak memory when formatting status embeds repeatedly', () => {
      const baseHeap = getHeapMB();

      for (let iteration = 0; iteration < 50; iteration++) {
        const raids: StatusRaid[] = Array.from({ length: 7 }, (_, i) => ({
          id: `leak-status-${iteration}-${i}`,
          description: `Raid ${i}`,
          raidDate: new Date(Date.now() + (i + 1) * 86400000),
          status: 'open',
          attendance: Array.from({ length: 100 }, (_, j) => ({
            status: STATUSES[j % STATUSES.length] as string,
            wowClass: WOW_CLASSES[j % WOW_CLASSES.length],
            wowSpec: 'Arms',
          })),
        }));

        formatStatusEmbed(raids, 'en');
      }

      const endHeap = getHeapMB();
      const heapGrowth = endHeap - baseHeap;
      expect(heapGrowth).toBeLessThan(50);
    });

    it('should not leak memory when calculating raid stats repeatedly', () => {
      const baseHeap = getHeapMB();

      for (let iteration = 0; iteration < 100; iteration++) {
        const attendance = Array.from({ length: 200 }, (_, j) => ({
          userId: `user-${j}`,
          username: `Player${j}`,
          status: STATUSES[j % STATUSES.length] as string,
          wowClass: WOW_CLASSES[j % WOW_CLASSES.length],
          wowSpec: 'Arms',
        }));

        calculateRaidStats(attendance);
      }

      const endHeap = getHeapMB();
      const heapGrowth = endHeap - baseHeap;
      expect(heapGrowth).toBeLessThan(50);
    });

    it('should handle 500 guild members without excessive memory growth', () => {
      const baseHeap = getHeapMB();

      // Simulate a large guild with 500 unique members across 20 raids
      const raids = Array.from({ length: 20 }, (_, i) => ({
        id: `large-guild-raid-${i}`,
        attendance: Array.from({ length: 500 }, (_, j) => ({
          userId: `user-${j}`,
          username: `GuildMember${j}`,
          status: STATUSES[j % STATUSES.length] as string,
          wowClass: WOW_CLASSES[j % WOW_CLASSES.length],
          wowSpec: 'Arms',
        })),
      }));

      const result = calculateGuildStats(raids);

      // Verify correctness alongside performance
      expect(result.totalRaids).toBe(20);
      expect(result.totalRaiders).toBe(500);
      expect(result.topAttendees.length).toBe(10);

      const endHeap = getHeapMB();
      const heapGrowth = endHeap - baseHeap;
      expect(heapGrowth).toBeLessThan(50);
    });
  });
});
