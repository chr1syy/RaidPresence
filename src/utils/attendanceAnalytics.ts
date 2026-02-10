import prisma from '../database/client';
import { getSpecRole, getSpecsForClass, WoWRole } from './wowData';
import { getReliabilityScore, ReliabilityTier } from './statsCalculator';

/**
 * A single attendance history entry for display.
 */
export interface AttendanceHistoryEntry {
  raidId: string;
  raidDescription: string | null;
  raidDate: Date;
  status: string; // 'attending' | 'opted_out' | 'late'
  respondedAt: Date | null;
  wowClass: string | null;
  wowSpec: string | null;
}

/**
 * Player statistics for a given period.
 */
export interface PlayerStats {
  totalRaidsInvited: number;
  raidsAttended: number;
  attendanceRate: number; // 0-100
  optedOutCount: number;
  lateCount: number;
  reliability: ReliabilityTier;
  averageResponseTimeMs: number | null; // ms between raid creation and player response
  trend: TrendIndicator;
}

/**
 * Trend indicator for attendance.
 */
export type TrendIndicator = 'improving' | 'stable' | 'declining';

/**
 * Role distribution entry for a player.
 */
export interface RoleDistributionEntry {
  role: WoWRole;
  count: number;
  percentage: number;
}

/**
 * Player role distribution result.
 */
export interface PlayerRoleDistribution {
  mainRole: WoWRole | null;
  altRoles: WoWRole[];
  roleBreakdown: RoleDistributionEntry[];
  flexibilityScore: number; // 0-100, higher = more flexible
}

/**
 * Weekly trend data point.
 */
export interface TrendDataPoint {
  weekStart: Date;
  weekEnd: Date;
  attended: number;
  total: number;
  rate: number; // 0-100
}

/**
 * Trend analysis result.
 */
export interface TrendAnalysis {
  dataPoints: TrendDataPoint[];
  direction: TrendIndicator;
  confidence: number; // 0-100
}

/**
 * Convert a period string to a number of days.
 */
function periodToDays(period?: string): number | undefined {
  if (!period || period === 'all') return undefined;
  if (period === 'month') return 30;
  if (period === 'quarter') return 90;
  const parsed = parseInt(period, 10);
  return isNaN(parsed) ? undefined : parsed;
}

/**
 * Get the date filter cutoff based on days parameter.
 */
function getDateCutoff(days?: number): Date | undefined {
  if (!days) return undefined;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

/**
 * Fetch and format a player's attendance history.
 *
 * @param userId - Discord user ID
 * @param guildId - Guild ID
 * @param period - Time period: 'month' (30d), 'quarter' (90d), 'all'
 * @returns Array of attendance history entries sorted by date descending
 */
export async function getPlayerAttendanceHistory(
  userId: string,
  guildId: string,
  period?: string,
): Promise<AttendanceHistoryEntry[]> {
  const days = periodToDays(period);
  const cutoff = getDateCutoff(days);

  const records = await prisma.raidAttendance.findMany({
    where: {
      userId,
      guildId,
      ...(cutoff ? { raid: { raidDate: { gte: cutoff } } } : {}),
    },
    include: {
      raid: {
        select: {
          id: true,
          description: true,
          raidDate: true,
        },
      },
    },
    orderBy: {
      raid: {
        raidDate: 'desc',
      },
    },
  });

  return records.map((r) => ({
    raidId: r.raid.id,
    raidDescription: r.raid.description,
    raidDate: r.raid.raidDate,
    status: r.status,
    respondedAt: r.respondedAt,
    wowClass: r.wowClass,
    wowSpec: r.wowSpec,
  }));
}

/**
 * Calculate single player statistics for a given period.
 *
 * @param userId - Discord user ID
 * @param guildId - Guild ID
 * @param period - Time period: 'month' (30d), 'quarter' (90d), 'all'
 * @returns PlayerStats with attendance breakdown, reliability, response time, and trend
 */
export async function calculatePlayerStats(
  userId: string,
  guildId: string,
  period?: string,
): Promise<PlayerStats> {
  const days = periodToDays(period);
  const cutoff = getDateCutoff(days);

  const records = await prisma.raidAttendance.findMany({
    where: {
      userId,
      guildId,
      ...(cutoff ? { raid: { raidDate: { gte: cutoff } } } : {}),
    },
    include: {
      raid: {
        select: {
          raidDate: true,
          createdAt: true,
        },
      },
    },
  });

  const totalRaidsInvited = records.length;
  const attending = records.filter((r) => r.status === 'attending');
  const optedOut = records.filter((r) => r.status === 'opted_out');
  const late = records.filter((r) => r.status === 'late');

  const raidsAttended = attending.length + late.length;
  const attendanceRate =
    totalRaidsInvited > 0
      ? Math.round((raidsAttended / totalRaidsInvited) * 1000) / 10
      : 0;

  const reliability = getReliabilityScore(attendanceRate);

  // Average response time (from raid creation to player response)
  let averageResponseTimeMs: number | null = null;
  const responseTimes: number[] = [];
  for (const r of records) {
    if (r.respondedAt) {
      const diff = r.respondedAt.getTime() - r.raid.createdAt.getTime();
      if (diff >= 0) {
        responseTimes.push(diff);
      }
    }
  }
  if (responseTimes.length > 0) {
    averageResponseTimeMs =
      Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
  }

  // Calculate trend from history
  const trend = calculateTrendFromRecords(records);

  return {
    totalRaidsInvited,
    raidsAttended,
    attendanceRate,
    optedOutCount: optedOut.length,
    lateCount: late.length,
    reliability,
    averageResponseTimeMs,
    trend,
  };
}

/**
 * Get a player's role distribution across raids.
 *
 * @param userId - Discord user ID
 * @param guildId - Guild ID
 * @returns PlayerRoleDistribution with main role, alt roles, and flexibility score
 */
export async function getPlayerRoleDistribution(
  userId: string,
  guildId: string,
): Promise<PlayerRoleDistribution> {
  const records = await prisma.raidAttendance.findMany({
    where: {
      userId,
      guildId,
      status: { in: ['attending', 'late'] },
    },
    select: {
      wowClass: true,
      wowSpec: true,
    },
  });

  const roleCounts = new Map<WoWRole, number>();

  for (const r of records) {
    const role = getSpecRole(r.wowClass, r.wowSpec);
    if (role) {
      roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
    }
  }

  const totalWithRole = Array.from(roleCounts.values()).reduce((a, b) => a + b, 0);

  const roleBreakdown: RoleDistributionEntry[] = Array.from(roleCounts.entries())
    .map(([role, count]) => ({
      role,
      count,
      percentage: totalWithRole > 0 ? Math.round((count / totalWithRole) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const mainRole = getMainRole(roleBreakdown);
  const altRoles = roleBreakdown
    .filter((r) => r.role !== mainRole)
    .map((r) => r.role);

  // Flexibility: based on unique classes played and their possible roles
  const classesPlayed = new Set<string>();
  for (const r of records) {
    if (r.wowClass) classesPlayed.add(r.wowClass);
  }

  let possibleRoles = new Set<WoWRole>();
  for (const cls of classesPlayed) {
    const roles = getRoleFlexibility(cls);
    roles.forEach((r) => possibleRoles.add(r));
  }

  const flexibilityScore = Math.min(
    100,
    Math.round((possibleRoles.size / 4) * 100),
  );

  return {
    mainRole,
    altRoles,
    roleBreakdown,
    flexibilityScore,
  };
}

/**
 * Get trend data for a player's attendance over time.
 *
 * @param userId - Discord user ID
 * @param guildId - Guild ID
 * @param periodDays - Number of days to analyze (default 90)
 * @returns TrendAnalysis with weekly data points and direction
 */
export async function getTrendData(
  userId: string,
  guildId: string,
  periodDays: number = 90,
): Promise<TrendAnalysis> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - periodDays);

  const records = await prisma.raidAttendance.findMany({
    where: {
      userId,
      guildId,
      raid: { raidDate: { gte: cutoff } },
    },
    include: {
      raid: {
        select: {
          raidDate: true,
        },
      },
    },
  });

  return analyzeTrendFromRecords(records, periodDays);
}

/**
 * Analyze trend data from fetched records.
 * Exported for testing with pre-built data.
 */
export function analyzeTrendFromRecords(
  records: Array<{ status: string; raid: { raidDate: Date } }>,
  periodDays: number,
): TrendAnalysis {
  // Build weekly buckets
  const now = new Date();
  const weeks: TrendDataPoint[] = [];
  const numWeeks = Math.ceil(periodDays / 7);

  for (let i = numWeeks - 1; i >= 0; i--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - i * 7);
    weekEnd.setHours(23, 59, 59, 999);

    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const weekRecords = records.filter((r) => {
      const d = r.raid.raidDate;
      return d >= weekStart && d <= weekEnd;
    });

    const attended = weekRecords.filter(
      (r) => r.status === 'attending' || r.status === 'late',
    ).length;
    const total = weekRecords.length;
    const rate = total > 0 ? Math.round((attended / total) * 1000) / 10 : 0;

    weeks.push({ weekStart, weekEnd, attended, total, rate });
  }

  // Filter to weeks with data
  const weeksWithData = weeks.filter((w) => w.total > 0);
  const direction = calculateTrendDirection(weeksWithData);
  const confidence = calculateTrendConfidence(weeksWithData);

  return {
    dataPoints: weeks,
    direction,
    confidence,
  };
}

/**
 * Calculate trend direction from records (used for PlayerStats).
 */
function calculateTrendFromRecords(
  records: Array<{ status: string; raid: { raidDate: Date; createdAt: Date } }>,
): TrendIndicator {
  if (records.length < 3) return 'stable';

  // Sort by raid date ascending
  const sorted = [...records].sort(
    (a, b) => a.raid.raidDate.getTime() - b.raid.raidDate.getTime(),
  );

  // Split into halves and compare attendance rates
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  const firstRate = calculateAttendanceRateFromRecords(firstHalf);
  const secondRate = calculateAttendanceRateFromRecords(secondHalf);

  const diff = secondRate - firstRate;
  if (diff > 10) return 'improving';
  if (diff < -10) return 'declining';
  return 'stable';
}

/**
 * Calculate attendance rate from a set of records.
 */
function calculateAttendanceRateFromRecords(
  records: Array<{ status: string }>,
): number {
  if (records.length === 0) return 0;
  const attended = records.filter(
    (r) => r.status === 'attending' || r.status === 'late',
  ).length;
  return (attended / records.length) * 100;
}

/**
 * Calculate trend direction from weekly data points.
 */
function calculateTrendDirection(weeksWithData: TrendDataPoint[]): TrendIndicator {
  if (weeksWithData.length < 2) return 'stable';

  // Use simple linear regression on rates
  const n = weeksWithData.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += weeksWithData[i].rate;
    sumXY += i * weeksWithData[i].rate;
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 'stable';

  const slope = (n * sumXY - sumX * sumY) / denominator;

  // Threshold: > 2% per week = improving, < -2% = declining
  if (slope > 2) return 'improving';
  if (slope < -2) return 'declining';
  return 'stable';
}

/**
 * Calculate confidence score for the trend based on data quantity.
 */
function calculateTrendConfidence(weeksWithData: TrendDataPoint[]): number {
  if (weeksWithData.length === 0) return 0;
  if (weeksWithData.length === 1) return 20;

  const totalRaids = weeksWithData.reduce((sum, w) => sum + w.total, 0);

  // More weeks with data + more total raids = higher confidence
  const weeksFactor = Math.min(weeksWithData.length / 8, 1); // max at 8 weeks
  const raidsFactor = Math.min(totalRaids / 10, 1); // max at 10 raids

  return Math.round((weeksFactor * 0.5 + raidsFactor * 0.5) * 100);
}

// --- Helper Functions ---

/**
 * Get all possible roles for a WoW class based on its specs.
 *
 * @param wowClass - The WoW class name (e.g., "Druid")
 * @returns Array of possible WoWRoles for that class
 */
export function getRoleFlexibility(wowClass: string): WoWRole[] {
  const specs = getSpecsForClass(wowClass);
  if (specs.length === 0) return [];

  const roles = new Set<WoWRole>();
  for (const spec of specs) {
    const role = getSpecRole(wowClass, spec);
    if (role) roles.add(role);
  }

  return Array.from(roles);
}

/**
 * Map an attendance rate to a reliability tier name and emoji.
 *
 * @param attendanceRate - 0-100 percentage
 * @returns ReliabilityTier with label and emoji
 */
export function calculateReliabilityTier(attendanceRate: number): ReliabilityTier {
  return getReliabilityScore(attendanceRate);
}

/**
 * Get the main (most common) role from a role distribution.
 *
 * @param roleBreakdown - Array of role distribution entries sorted by count desc
 * @returns The most common role, or null if no roles
 */
export function getMainRole(roleBreakdown: RoleDistributionEntry[]): WoWRole | null {
  if (roleBreakdown.length === 0) return null;
  return roleBreakdown[0].role;
}

/**
 * Get the trend emoji for display.
 */
export function getTrendEmoji(trend: TrendIndicator): string {
  switch (trend) {
    case 'improving':
      return '↗️';
    case 'declining':
      return '↘️';
    case 'stable':
    default:
      return '→';
  }
}

/**
 * Format average response time to a human-readable string.
 */
export function formatResponseTime(ms: number | null): string {
  if (ms === null) return 'N/A';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}
