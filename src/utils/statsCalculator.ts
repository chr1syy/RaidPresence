import { getSpecRole, WoWRole } from './wowData';

/**
 * Attendance record shape used by stats calculations.
 * Matches the RaidAttendance model fields we need.
 */
export interface AttendanceRecord {
  userId: string;
  username: string;
  status: string; // 'attending' | 'opted_out' | 'late'
  wowClass: string | null;
  wowSpec: string | null;
}

/**
 * Single raid statistics result.
 */
export interface RaidStats {
  totalMembers: number;
  attendingCount: number;
  optedOutCount: number;
  lateCount: number;
  attendanceRate: number; // 0-100
  composition: RoleBreakdown;
  classDistribution: ClassCount[];
}

/**
 * Role breakdown with counts.
 */
export interface RoleBreakdown {
  tanks: number;
  healers: number;
  melee: number;
  ranged: number;
  noClass: number;
}

/**
 * Class frequency entry.
 */
export interface ClassCount {
  className: string;
  count: number;
}

/**
 * Guild-wide statistics result.
 */
export interface GuildStats {
  totalRaids: number;
  averageAttendanceRate: number; // 0-100
  totalRaiders: number;
  topAttendees: TopAttendee[];
  classDistribution: ClassCount[];
}

/**
 * Top attendee entry for guild stats.
 */
export interface TopAttendee {
  userId: string;
  username: string;
  raidsAttended: number;
  totalRaids: number;
  attendanceRate: number; // 0-100
}

/**
 * Reliability tier returned by getReliabilityScore.
 */
export interface ReliabilityTier {
  label: string;
  emoji: string;
}

/**
 * Calculate statistics for a single raid.
 *
 * @param attendance - Array of attendance records for the raid
 * @returns RaidStats with attendance breakdown, role composition, and class distribution
 */
export function calculateRaidStats(attendance: AttendanceRecord[]): RaidStats {
  const totalMembers = attendance.length;
  const attending = attendance.filter(a => a.status === 'attending');
  const optedOut = attendance.filter(a => a.status === 'opted_out');
  const late = attendance.filter(a => a.status === 'late');

  const attendingCount = attending.length;
  const optedOutCount = optedOut.length;
  const lateCount = late.length;
  const attendanceRate = totalMembers > 0
    ? Math.round((attendingCount / totalMembers) * 1000) / 10
    : 0;

  // Role composition from attending + late (people who are coming)
  const activePlayers = [...attending, ...late];
  const composition = calculateRoleBreakdown(activePlayers);

  // Class distribution from all members (attending + late)
  const classDistribution = calculateClassDistribution(activePlayers);

  return {
    totalMembers,
    attendingCount,
    optedOutCount,
    lateCount,
    attendanceRate,
    composition,
    classDistribution,
  };
}

/**
 * Calculate guild-wide statistics from an array of raids with their attendance.
 *
 * @param raids - Array of raids, each with an attendance array
 * @returns GuildStats with aggregate metrics, top attendees, and class distribution
 */
export function calculateGuildStats(
  raids: Array<{ id: string; attendance: AttendanceRecord[] }>
): GuildStats {
  const totalRaids = raids.length;

  if (totalRaids === 0) {
    return {
      totalRaids: 0,
      averageAttendanceRate: 0,
      totalRaiders: 0,
      topAttendees: [],
      classDistribution: [],
    };
  }

  // Calculate per-raid attendance rates and aggregate
  let totalAttendanceRate = 0;
  const playerMap = new Map<string, { username: string; attended: number; total: number; wowClass: string | null }>();
  const allActiveAttendance: AttendanceRecord[] = [];

  for (const raid of raids) {
    const total = raid.attendance.length;
    const attending = raid.attendance.filter(a => a.status === 'attending' || a.status === 'late');
    const rate = total > 0 ? (attending.length / total) * 100 : 0;
    totalAttendanceRate += rate;

    for (const a of raid.attendance) {
      const existing = playerMap.get(a.userId);
      if (existing) {
        existing.total++;
        if (a.status === 'attending' || a.status === 'late') {
          existing.attended++;
        }
      } else {
        playerMap.set(a.userId, {
          username: a.username,
          attended: (a.status === 'attending' || a.status === 'late') ? 1 : 0,
          total: 1,
          wowClass: a.wowClass,
        });
      }

      if (a.status === 'attending' || a.status === 'late') {
        allActiveAttendance.push(a);
      }
    }
  }

  const averageAttendanceRate = Math.round((totalAttendanceRate / totalRaids) * 10) / 10;
  const totalRaiders = playerMap.size;

  // Top attendees sorted by attendance rate, then by raids attended
  const topAttendees: TopAttendee[] = Array.from(playerMap.entries())
    .map(([userId, data]) => ({
      userId,
      username: data.username,
      raidsAttended: data.attended,
      totalRaids: data.total,
      attendanceRate: data.total > 0
        ? Math.round((data.attended / data.total) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => {
      if (b.attendanceRate !== a.attendanceRate) return b.attendanceRate - a.attendanceRate;
      return b.raidsAttended - a.raidsAttended;
    })
    .slice(0, 10);

  const classDistribution = calculateClassDistribution(allActiveAttendance);

  return {
    totalRaids,
    averageAttendanceRate,
    totalRaiders,
    topAttendees,
    classDistribution,
  };
}

/**
 * Get a reliability score tier based on attendance rate.
 *
 * @param attendanceRate - Attendance rate as a percentage (0-100)
 * @returns ReliabilityTier with label and emoji
 */
export function getReliabilityScore(attendanceRate: number): ReliabilityTier {
  if (attendanceRate >= 95) {
    return { label: 'Highly Reliable', emoji: '\uD83D\uDFE2' }; // green circle
  } else if (attendanceRate >= 80) {
    return { label: 'Reliable', emoji: '\uD83D\uDFE1' }; // yellow circle
  } else {
    return { label: 'Inconsistent', emoji: '\uD83D\uDD34' }; // red circle
  }
}

/**
 * Calculate role breakdown from a list of attendance records.
 */
function calculateRoleBreakdown(records: AttendanceRecord[]): RoleBreakdown {
  const breakdown: RoleBreakdown = {
    tanks: 0,
    healers: 0,
    melee: 0,
    ranged: 0,
    noClass: 0,
  };

  for (const record of records) {
    const role = getSpecRole(record.wowClass, record.wowSpec);
    if (role === 'Tank') breakdown.tanks++;
    else if (role === 'Healer') breakdown.healers++;
    else if (role === 'Melee') breakdown.melee++;
    else if (role === 'Ranged') breakdown.ranged++;
    else breakdown.noClass++;
  }

  return breakdown;
}

/**
 * Calculate class distribution from a list of attendance records.
 * Returns sorted array (most frequent first).
 */
function calculateClassDistribution(records: AttendanceRecord[]): ClassCount[] {
  const classMap = new Map<string, number>();

  for (const record of records) {
    if (record.wowClass) {
      classMap.set(record.wowClass, (classMap.get(record.wowClass) || 0) + 1);
    }
  }

  return Array.from(classMap.entries())
    .map(([className, count]) => ({ className, count }))
    .sort((a, b) => b.count - a.count);
}
