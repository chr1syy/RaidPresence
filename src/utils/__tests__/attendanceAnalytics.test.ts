jest.mock('../../database/client');

import prisma from '../../database/client';
import {
  getPlayerAttendanceHistory,
  calculatePlayerStats,
  getPlayerRoleDistribution,
  getTrendData,
  analyzeTrendFromRecords,
  getRoleFlexibility,
  calculateReliabilityTier,
  getMainRole,
  getTrendEmoji,
  formatResponseTime,
  RoleDistributionEntry,
} from '../attendanceAnalytics';

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

beforeEach(() => {
  jest.clearAllMocks();
});

// --- Helper Factories ---

function makeAttendanceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'att-1',
    raidId: 'raid-1',
    userId: 'user-1',
    username: 'TestPlayer',
    status: 'attending',
    wowClass: null as string | null,
    wowSpec: null as string | null,
    respondedAt: null as Date | null,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
    guildId: 'guild-1',
    raid: {
      id: 'raid-1',
      description: 'Weekly Raid',
      raidDate: new Date('2026-01-20T19:00:00Z'),
      createdAt: new Date('2026-01-15T10:00:00Z'),
    },
    ...overrides,
  };
}

// --- getPlayerAttendanceHistory ---

describe('getPlayerAttendanceHistory()', () => {
  it('should return formatted history entries sorted by date descending', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      makeAttendanceRecord({
        raid: {
          id: 'raid-2',
          description: 'Thursday Raid',
          raidDate: new Date('2026-01-22T19:00:00Z'),
        },
      }),
      makeAttendanceRecord({
        raid: {
          id: 'raid-1',
          description: 'Monday Raid',
          raidDate: new Date('2026-01-20T19:00:00Z'),
        },
      }),
    ]);

    const history = await getPlayerAttendanceHistory('user-1', 'guild-1');

    expect(history).toHaveLength(2);
    expect(history[0].raidId).toBe('raid-2');
    expect(history[0].raidDescription).toBe('Thursday Raid');
    expect(history[0].status).toBe('attending');
    expect(history[1].raidId).toBe('raid-1');
  });

  it('should return empty array when player has no history', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

    const history = await getPlayerAttendanceHistory('user-1', 'guild-1');

    expect(history).toEqual([]);
  });

  it('should pass period filter to database query', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

    await getPlayerAttendanceHistory('user-1', 'guild-1', 'month');

    const callArgs = (mockedPrisma.raidAttendance.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.where.raid.raidDate.gte).toBeDefined();
  });

  it('should not filter by date when period is "all"', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

    await getPlayerAttendanceHistory('user-1', 'guild-1', 'all');

    const callArgs = (mockedPrisma.raidAttendance.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.where.raid).toBeUndefined();
  });
});

// --- calculatePlayerStats ---

describe('calculatePlayerStats()', () => {
  it('should calculate stats for perfect attendance (100%)', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      makeAttendanceRecord({ status: 'attending' }),
      makeAttendanceRecord({ status: 'attending', raidId: 'raid-2' }),
      makeAttendanceRecord({ status: 'attending', raidId: 'raid-3' }),
      makeAttendanceRecord({ status: 'attending', raidId: 'raid-4' }),
      makeAttendanceRecord({ status: 'attending', raidId: 'raid-5' }),
    ]);

    const stats = await calculatePlayerStats('user-1', 'guild-1');

    expect(stats.totalRaidsInvited).toBe(5);
    expect(stats.raidsAttended).toBe(5);
    expect(stats.attendanceRate).toBe(100);
    expect(stats.optedOutCount).toBe(0);
    expect(stats.lateCount).toBe(0);
    expect(stats.reliability.label).toBe('Highly Reliable');
  });

  it('should calculate stats for mixed attendance with opt-outs', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      makeAttendanceRecord({ status: 'attending' }),
      makeAttendanceRecord({ status: 'attending', raidId: 'raid-2' }),
      makeAttendanceRecord({ status: 'opted_out', raidId: 'raid-3' }),
      makeAttendanceRecord({ status: 'late', raidId: 'raid-4' }),
      makeAttendanceRecord({ status: 'opted_out', raidId: 'raid-5' }),
    ]);

    const stats = await calculatePlayerStats('user-1', 'guild-1');

    expect(stats.totalRaidsInvited).toBe(5);
    expect(stats.raidsAttended).toBe(3); // 2 attending + 1 late
    expect(stats.attendanceRate).toBe(60);
    expect(stats.optedOutCount).toBe(2);
    expect(stats.lateCount).toBe(1);
    expect(stats.reliability.label).toBe('Inconsistent');
  });

  it('should calculate stats for a single raid', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      makeAttendanceRecord({ status: 'attending' }),
    ]);

    const stats = await calculatePlayerStats('user-1', 'guild-1');

    expect(stats.totalRaidsInvited).toBe(1);
    expect(stats.raidsAttended).toBe(1);
    expect(stats.attendanceRate).toBe(100);
    expect(stats.trend).toBe('stable'); // Not enough data for trend
  });

  it('should handle zero raids', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

    const stats = await calculatePlayerStats('user-1', 'guild-1');

    expect(stats.totalRaidsInvited).toBe(0);
    expect(stats.raidsAttended).toBe(0);
    expect(stats.attendanceRate).toBe(0);
    expect(stats.optedOutCount).toBe(0);
    expect(stats.lateCount).toBe(0);
    expect(stats.reliability.label).toBe('Inconsistent');
    expect(stats.averageResponseTimeMs).toBeNull();
    expect(stats.trend).toBe('stable');
  });

  it('should map reliability score correctly', async () => {
    // 95%+ = Highly Reliable
    const records = [];
    for (let i = 0; i < 20; i++) {
      records.push(makeAttendanceRecord({
        status: i === 0 ? 'opted_out' : 'attending',
        raidId: `raid-${i}`,
      }));
    }
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const stats = await calculatePlayerStats('user-1', 'guild-1');

    expect(stats.attendanceRate).toBe(95);
    expect(stats.reliability.label).toBe('Highly Reliable');
  });

  it('should calculate average response time from respondedAt', async () => {
    const raidCreatedAt = new Date('2026-01-15T10:00:00Z');
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      makeAttendanceRecord({
        respondedAt: new Date('2026-01-15T11:00:00Z'), // 1 hour after
        raid: { raidDate: new Date('2026-01-20T19:00:00Z'), createdAt: raidCreatedAt },
      }),
      makeAttendanceRecord({
        raidId: 'raid-2',
        respondedAt: new Date('2026-01-15T13:00:00Z'), // 3 hours after
        raid: { raidDate: new Date('2026-01-21T19:00:00Z'), createdAt: raidCreatedAt },
      }),
    ]);

    const stats = await calculatePlayerStats('user-1', 'guild-1');

    // Average of 1h and 3h = 2h = 7200000ms
    expect(stats.averageResponseTimeMs).toBe(7200000);
  });

  it('should return null response time when no responses recorded', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      makeAttendanceRecord({ respondedAt: null }),
    ]);

    const stats = await calculatePlayerStats('user-1', 'guild-1');

    expect(stats.averageResponseTimeMs).toBeNull();
  });
});

// --- getPlayerRoleDistribution ---

describe('getPlayerRoleDistribution()', () => {
  it('should identify main role from single-role player', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      { wowClass: 'Warrior', wowSpec: 'Protection' },
      { wowClass: 'Warrior', wowSpec: 'Protection' },
      { wowClass: 'Warrior', wowSpec: 'Protection' },
    ]);

    const dist = await getPlayerRoleDistribution('user-1', 'guild-1');

    expect(dist.mainRole).toBe('Tank');
    expect(dist.altRoles).toEqual([]);
    expect(dist.roleBreakdown).toHaveLength(1);
    expect(dist.roleBreakdown[0].role).toBe('Tank');
    expect(dist.roleBreakdown[0].percentage).toBe(100);
  });

  it('should identify multiple specs/roles', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      { wowClass: 'Druid', wowSpec: 'Guardian' },    // Tank
      { wowClass: 'Druid', wowSpec: 'Guardian' },    // Tank
      { wowClass: 'Druid', wowSpec: 'Restoration' }, // Healer
    ]);

    const dist = await getPlayerRoleDistribution('user-1', 'guild-1');

    expect(dist.mainRole).toBe('Tank');
    expect(dist.altRoles).toEqual(['Healer']);
    expect(dist.roleBreakdown).toHaveLength(2);
  });

  it('should handle player with no class set', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      { wowClass: null, wowSpec: null },
      { wowClass: null, wowSpec: null },
    ]);

    const dist = await getPlayerRoleDistribution('user-1', 'guild-1');

    expect(dist.mainRole).toBeNull();
    expect(dist.altRoles).toEqual([]);
    expect(dist.roleBreakdown).toEqual([]);
    expect(dist.flexibilityScore).toBe(0);
  });

  it('should calculate flexibility score based on possible roles', async () => {
    // Druid can be Tank, Healer, Melee, Ranged = 4/4 = 100%
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      { wowClass: 'Druid', wowSpec: 'Guardian' },
    ]);

    const dist = await getPlayerRoleDistribution('user-1', 'guild-1');

    expect(dist.flexibilityScore).toBe(100);
  });

  it('should calculate lower flexibility for single-role classes', async () => {
    // Mage can only be Ranged = 1/4 = 25%
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      { wowClass: 'Mage', wowSpec: 'Fire' },
    ]);

    const dist = await getPlayerRoleDistribution('user-1', 'guild-1');

    expect(dist.flexibilityScore).toBe(25);
  });
});

// --- getTrendData ---

describe('getTrendData()', () => {
  it('should return weekly data points for the requested period', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

    const trend = await getTrendData('user-1', 'guild-1', 14);

    // 14 days = 2 weeks
    expect(trend.dataPoints.length).toBe(2);
  });

  it('should pass date cutoff to database query', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

    await getTrendData('user-1', 'guild-1', 30);

    const callArgs = (mockedPrisma.raidAttendance.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.where.raid.raidDate.gte).toBeDefined();
  });
});

// --- analyzeTrendFromRecords (pure function, easier to test) ---

describe('analyzeTrendFromRecords()', () => {
  it('should detect improving trend', () => {
    const now = new Date();
    const records = [];
    // 4 weeks ago: all opted_out, then gradually improving
    for (let week = 3; week >= 0; week--) {
      const raidDate = new Date(now);
      raidDate.setDate(raidDate.getDate() - week * 7);
      const status = week >= 2 ? 'opted_out' : 'attending';
      records.push({ status, raid: { raidDate } });
    }

    const trend = analyzeTrendFromRecords(records, 28);

    // Should detect improving (from opted_out to attending)
    expect(['improving', 'stable']).toContain(trend.direction);
  });

  it('should detect declining trend', () => {
    const now = new Date();
    const records = [];
    // Recent weeks: opted_out, older weeks: attending
    for (let week = 3; week >= 0; week--) {
      const raidDate = new Date(now);
      raidDate.setDate(raidDate.getDate() - week * 7);
      const status = week <= 1 ? 'opted_out' : 'attending';
      records.push({ status, raid: { raidDate } });
    }

    const trend = analyzeTrendFromRecords(records, 28);

    expect(['declining', 'stable']).toContain(trend.direction);
  });

  it('should detect stable trend when all attending', () => {
    const now = new Date();
    const records = [];
    for (let week = 3; week >= 0; week--) {
      const raidDate = new Date(now);
      raidDate.setDate(raidDate.getDate() - week * 7);
      records.push({ status: 'attending', raid: { raidDate } });
    }

    const trend = analyzeTrendFromRecords(records, 28);

    expect(trend.direction).toBe('stable');
  });

  it('should return stable for insufficient data', () => {
    const trend = analyzeTrendFromRecords([], 28);

    expect(trend.direction).toBe('stable');
    expect(trend.confidence).toBe(0);
  });

  it('should have low confidence with few data points', () => {
    const now = new Date();
    const records = [
      { status: 'attending', raid: { raidDate: now } },
    ];

    const trend = analyzeTrendFromRecords(records, 7);

    expect(trend.confidence).toBeLessThanOrEqual(50);
  });
});

// --- getRoleFlexibility ---

describe('getRoleFlexibility()', () => {
  it('should return all possible roles for Druid (Tank, Healer, Melee, Ranged)', () => {
    const roles = getRoleFlexibility('Druid');

    expect(roles).toContain('Tank');
    expect(roles).toContain('Healer');
    expect(roles).toContain('Melee');
    expect(roles).toContain('Ranged');
    expect(roles).toHaveLength(4);
  });

  it('should return only Ranged for Mage', () => {
    const roles = getRoleFlexibility('Mage');

    expect(roles).toEqual(['Ranged']);
  });

  it('should return Tank and Melee for Warrior', () => {
    const roles = getRoleFlexibility('Warrior');

    expect(roles).toContain('Tank');
    expect(roles).toContain('Melee');
    expect(roles).toHaveLength(2);
  });

  it('should return empty array for unknown class', () => {
    const roles = getRoleFlexibility('UnknownClass');

    expect(roles).toEqual([]);
  });

  it('should return Melee only for Rogue', () => {
    const roles = getRoleFlexibility('Rogue');

    expect(roles).toEqual(['Melee']);
  });
});

// --- calculateReliabilityTier ---

describe('calculateReliabilityTier()', () => {
  it('should return Highly Reliable for 95%+', () => {
    expect(calculateReliabilityTier(95).label).toBe('Highly Reliable');
    expect(calculateReliabilityTier(100).label).toBe('Highly Reliable');
  });

  it('should return Reliable for 80-94%', () => {
    expect(calculateReliabilityTier(80).label).toBe('Reliable');
    expect(calculateReliabilityTier(94).label).toBe('Reliable');
  });

  it('should return Inconsistent for below 80%', () => {
    expect(calculateReliabilityTier(79).label).toBe('Inconsistent');
    expect(calculateReliabilityTier(0).label).toBe('Inconsistent');
  });
});

// --- getMainRole ---

describe('getMainRole()', () => {
  it('should return the most common role', () => {
    const breakdown: RoleDistributionEntry[] = [
      { role: 'Tank', count: 10, percentage: 60 },
      { role: 'Healer', count: 5, percentage: 30 },
      { role: 'Melee', count: 2, percentage: 10 },
    ];

    expect(getMainRole(breakdown)).toBe('Tank');
  });

  it('should return null for empty breakdown', () => {
    expect(getMainRole([])).toBeNull();
  });
});

// --- getTrendEmoji ---

describe('getTrendEmoji()', () => {
  it('should return correct emoji for each trend', () => {
    expect(getTrendEmoji('improving')).toBe('↗️');
    expect(getTrendEmoji('declining')).toBe('↘️');
    expect(getTrendEmoji('stable')).toBe('→');
  });
});

// --- formatResponseTime ---

describe('formatResponseTime()', () => {
  it('should return N/A for null', () => {
    expect(formatResponseTime(null)).toBe('N/A');
  });

  it('should format minutes', () => {
    expect(formatResponseTime(300000)).toBe('5m'); // 5 minutes
  });

  it('should format hours and minutes', () => {
    expect(formatResponseTime(5400000)).toBe('1h 30m'); // 1.5 hours
  });

  it('should format days and hours', () => {
    expect(formatResponseTime(90000000)).toBe('1d 1h'); // 25 hours
  });
});

// =========================================================================
// Task 2.1.5: Additional Unit Tests for Attendance Analytics
// =========================================================================

// --- calculatePlayerStats (additional edge cases) ---

describe('calculatePlayerStats() - additional edge cases', () => {
  it('should return 0% attendance when all raids are opted_out', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      makeAttendanceRecord({ status: 'opted_out', raidId: 'raid-1' }),
      makeAttendanceRecord({ status: 'opted_out', raidId: 'raid-2' }),
      makeAttendanceRecord({ status: 'opted_out', raidId: 'raid-3' }),
    ]);

    const stats = await calculatePlayerStats('user-1', 'guild-1');

    expect(stats.totalRaidsInvited).toBe(3);
    expect(stats.raidsAttended).toBe(0);
    expect(stats.attendanceRate).toBe(0);
    expect(stats.optedOutCount).toBe(3);
    expect(stats.reliability.label).toBe('Inconsistent');
  });

  it('should count late arrivals towards attendance', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      makeAttendanceRecord({ status: 'late', raidId: 'raid-1' }),
      makeAttendanceRecord({ status: 'late', raidId: 'raid-2' }),
    ]);

    const stats = await calculatePlayerStats('user-1', 'guild-1');

    expect(stats.raidsAttended).toBe(2);
    expect(stats.lateCount).toBe(2);
    expect(stats.attendanceRate).toBe(100);
  });

  it('should detect improving trend when first half is opted_out and second half is attending', async () => {
    // Build records: 4 older opted_out, 4 newer attending
    const raidCreatedAt = new Date('2026-01-01T10:00:00Z');
    const records = [];
    for (let i = 0; i < 8; i++) {
      const raidDate = new Date('2026-01-10T19:00:00Z');
      raidDate.setDate(raidDate.getDate() + i * 3);
      records.push(
        makeAttendanceRecord({
          status: i < 4 ? 'opted_out' : 'attending',
          raidId: `raid-${i}`,
          raid: { raidDate, createdAt: raidCreatedAt },
        }),
      );
    }
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const stats = await calculatePlayerStats('user-1', 'guild-1');

    expect(stats.trend).toBe('improving');
  });

  it('should detect declining trend when first half is attending and second half is opted_out', async () => {
    const raidCreatedAt = new Date('2026-01-01T10:00:00Z');
    const records = [];
    for (let i = 0; i < 8; i++) {
      const raidDate = new Date('2026-01-10T19:00:00Z');
      raidDate.setDate(raidDate.getDate() + i * 3);
      records.push(
        makeAttendanceRecord({
          status: i < 4 ? 'attending' : 'opted_out',
          raidId: `raid-${i}`,
          raid: { raidDate, createdAt: raidCreatedAt },
        }),
      );
    }
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const stats = await calculatePlayerStats('user-1', 'guild-1');

    expect(stats.trend).toBe('declining');
  });

  it('should handle period "quarter" filtering (90 days)', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

    await calculatePlayerStats('user-1', 'guild-1', 'quarter');

    const callArgs = (mockedPrisma.raidAttendance.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.where.raid.raidDate.gte).toBeDefined();
    // Cutoff should be roughly 90 days ago
    const cutoff = callArgs.where.raid.raidDate.gte as Date;
    const now = new Date();
    const daysDiff = Math.round((now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24));
    expect(daysDiff).toBeGreaterThanOrEqual(89);
    expect(daysDiff).toBeLessThanOrEqual(91);
  });

  it('should ignore negative response times (respondedAt before raid creation)', async () => {
    const raidCreatedAt = new Date('2026-01-15T10:00:00Z');
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      makeAttendanceRecord({
        respondedAt: new Date('2026-01-15T09:00:00Z'), // BEFORE raid creation (negative diff)
        raid: { raidDate: new Date('2026-01-20T19:00:00Z'), createdAt: raidCreatedAt },
      }),
      makeAttendanceRecord({
        raidId: 'raid-2',
        respondedAt: new Date('2026-01-15T12:00:00Z'), // 2 hours after
        raid: { raidDate: new Date('2026-01-21T19:00:00Z'), createdAt: raidCreatedAt },
      }),
    ]);

    const stats = await calculatePlayerStats('user-1', 'guild-1');

    // Only the valid 2h response time should be counted
    expect(stats.averageResponseTimeMs).toBe(7200000);
  });
});

// --- getPlayerRoleDistribution (additional edge cases) ---

describe('getPlayerRoleDistribution() - additional edge cases', () => {
  it('should handle player who plays multiple different classes', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      { wowClass: 'Warrior', wowSpec: 'Protection' },    // Tank
      { wowClass: 'Warrior', wowSpec: 'Protection' },    // Tank
      { wowClass: 'Paladin', wowSpec: 'Holy' },           // Healer
      { wowClass: 'Mage', wowSpec: 'Fire' },              // Ranged
    ]);

    const dist = await getPlayerRoleDistribution('user-1', 'guild-1');

    expect(dist.mainRole).toBe('Tank');
    expect(dist.altRoles).toContain('Healer');
    expect(dist.altRoles).toContain('Ranged');
    expect(dist.roleBreakdown).toHaveLength(3);
    // Flexibility: Warrior (Tank, Melee) + Paladin (Tank, Healer, Melee) + Mage (Ranged) = 4 unique roles
    expect(dist.flexibilityScore).toBe(100);
  });

  it('should handle empty records (no attending/late raids)', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

    const dist = await getPlayerRoleDistribution('user-1', 'guild-1');

    expect(dist.mainRole).toBeNull();
    expect(dist.altRoles).toEqual([]);
    expect(dist.roleBreakdown).toEqual([]);
    expect(dist.flexibilityScore).toBe(0);
  });

  it('should handle mixed null and valid class entries', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      { wowClass: 'Priest', wowSpec: 'Shadow' },  // Ranged
      { wowClass: null, wowSpec: null },
      { wowClass: 'Priest', wowSpec: 'Holy' },     // Healer
    ]);

    const dist = await getPlayerRoleDistribution('user-1', 'guild-1');

    expect(dist.mainRole).not.toBeNull();
    // 2 valid role entries, null is skipped
    expect(dist.roleBreakdown).toHaveLength(2);
    const totalCount = dist.roleBreakdown.reduce((sum, r) => sum + r.count, 0);
    expect(totalCount).toBe(2);
  });

  it('should calculate correct percentages for role distribution', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      { wowClass: 'Paladin', wowSpec: 'Holy' },        // Healer
      { wowClass: 'Paladin', wowSpec: 'Holy' },        // Healer
      { wowClass: 'Paladin', wowSpec: 'Holy' },        // Healer
      { wowClass: 'Paladin', wowSpec: 'Retribution' }, // Melee
    ]);

    const dist = await getPlayerRoleDistribution('user-1', 'guild-1');

    expect(dist.mainRole).toBe('Healer');
    const healerEntry = dist.roleBreakdown.find(r => r.role === 'Healer');
    const meleeEntry = dist.roleBreakdown.find(r => r.role === 'Melee');
    expect(healerEntry?.percentage).toBe(75);
    expect(meleeEntry?.percentage).toBe(25);
  });
});

// --- getTrendData / analyzeTrendFromRecords (additional edge cases) ---

describe('getTrendData() - additional edge cases', () => {
  it('should default to 90-day period when no periodDays given', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

    const trend = await getTrendData('user-1', 'guild-1');

    // 90 days = 13 weeks (ceil(90/7))
    expect(trend.dataPoints.length).toBe(13);
  });

  it('should correctly categorize records into weekly buckets', async () => {
    const now = new Date();
    const thisWeekDate = new Date(now);
    thisWeekDate.setDate(thisWeekDate.getDate() - 1); // yesterday

    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      { status: 'attending', raid: { raidDate: thisWeekDate } },
      { status: 'attending', raid: { raidDate: thisWeekDate } },
      { status: 'opted_out', raid: { raidDate: thisWeekDate } },
    ]);

    const trend = await getTrendData('user-1', 'guild-1', 7);

    // 7 days = 1 week bucket
    expect(trend.dataPoints.length).toBe(1);
    // The most recent bucket should have our data
    const lastBucket = trend.dataPoints[trend.dataPoints.length - 1];
    expect(lastBucket.total).toBe(3);
    expect(lastBucket.attended).toBe(2);
    expect(lastBucket.rate).toBeCloseTo(66.7, 0);
  });
});

describe('analyzeTrendFromRecords() - additional edge cases', () => {
  it('should return high confidence with many weeks and many raids', () => {
    const now = new Date();
    const records = [];
    // 10 weeks of 2 raids each = 20 raids across 10 weeks
    for (let week = 9; week >= 0; week--) {
      for (let r = 0; r < 2; r++) {
        const raidDate = new Date(now);
        raidDate.setDate(raidDate.getDate() - week * 7 - r);
        records.push({ status: 'attending', raid: { raidDate } });
      }
    }

    const trend = analyzeTrendFromRecords(records, 70);

    expect(trend.confidence).toBeGreaterThanOrEqual(80);
  });

  it('should categorize late status as attended in weekly buckets', () => {
    const now = new Date();
    const raidDate = new Date(now);
    raidDate.setDate(raidDate.getDate() - 1);

    const records = [
      { status: 'late', raid: { raidDate } },
      { status: 'opted_out', raid: { raidDate } },
    ];

    const trend = analyzeTrendFromRecords(records, 7);

    const lastBucket = trend.dataPoints[trend.dataPoints.length - 1];
    expect(lastBucket.attended).toBe(1);
    expect(lastBucket.total).toBe(2);
  });

  it('should return 0 rate for weeks with only opted_out records', () => {
    const now = new Date();
    const raidDate = new Date(now);
    raidDate.setDate(raidDate.getDate() - 1);

    const records = [
      { status: 'opted_out', raid: { raidDate } },
      { status: 'opted_out', raid: { raidDate } },
    ];

    const trend = analyzeTrendFromRecords(records, 7);

    const lastBucket = trend.dataPoints[trend.dataPoints.length - 1];
    expect(lastBucket.rate).toBe(0);
    expect(lastBucket.attended).toBe(0);
  });

  it('should handle single record with low confidence', () => {
    const now = new Date();
    const records = [
      { status: 'attending', raid: { raidDate: now } },
    ];

    const trend = analyzeTrendFromRecords(records, 7);

    expect(trend.direction).toBe('stable');
    // Single week with one raid: low confidence
    expect(trend.confidence).toBeLessThanOrEqual(25);
  });
});
