import prisma from '../database/client';
import { BadgeType } from '@prisma/client';
import { Client } from 'discord.js';
import { getSpecRole, WoWRole } from './wowData';
import { sendBadgeCelebration } from './badgeNotifier';

/**
 * Result of a badge check: which badges were newly awarded.
 */
export interface BadgeCheckResult {
  newBadges: BadgeType[];
  existingBadges: BadgeType[];
}

/**
 * A badge record as returned by getBadges().
 */
export interface BadgeRecord {
  badgeType: BadgeType;
  earnedAt: Date;
  awardedBy: string | null;
  reason: string | null;
}

// --- Main Entry Points ---

/**
 * Check all automatic badge criteria for a player and award any earned badges.
 * Called after each attendance update.
 */
export async function checkAndAwardBadges(
  userId: string,
  guildId: string,
  client?: Client,
  raidId?: string,
): Promise<BadgeCheckResult> {
  const existing = await prisma.badge.findMany({
    where: { userId, guildId },
    select: { badgeType: true },
  });
  const existingTypes = new Set(existing.map((b) => b.badgeType));

  const checks: Array<{ type: BadgeType; check: () => Promise<boolean> }> = [
    { type: 'PERFECT_ATTENDANCE', check: () => checkPerfectAttendance(userId, guildId) },
    { type: 'TANK_MAIN', check: () => checkTankMain(userId, guildId) },
    { type: 'HEALER_HERO', check: () => checkHealerHero(userId, guildId) },
    { type: 'DAMAGE_DEALER', check: () => checkDamageDealer(userId, guildId) },
    { type: 'SHARPSHOOTER', check: () => checkSharpshooter(userId, guildId) },
    { type: 'ALWAYS_ON_TIME', check: () => checkAlwaysOnTime(userId, guildId) },
    { type: 'EARLY_BIRD', check: () => checkEarlyBird(userId, guildId) },
    { type: 'TEAM_PLAYER', check: () => checkTeamPlayer(userId, guildId) },
    { type: 'RELIABLE_MEMBER', check: () => checkReliableMember(userId, guildId) },
    { type: 'RISING_STAR', check: () => checkRisingStar(userId, guildId) },
    { type: 'VETERAN_RAIDER', check: () => checkVeteranRaider(userId, guildId) },
  ];

  const newBadges: BadgeType[] = [];

  for (const { type, check } of checks) {
    if (existingTypes.has(type)) continue;
    const earned = await check();
    if (earned) {
      await awardBadge(userId, guildId, type);
      newBadges.push(type);
    }
  }

  if (newBadges.length > 0) {
    await updateBadgeView(userId, guildId);

    // Send celebration messages
    if (client) {
      for (const badgeType of newBadges) {
        await sendBadgeCelebration(client, guildId, userId, badgeType, raidId);
      }
    }
  }

  return {
    newBadges,
    existingBadges: Array.from(existingTypes),
  };
}

/**
 * Award a single badge to a player. Uses upsert to prevent duplicates.
 */
export async function awardBadge(
  userId: string,
  guildId: string,
  badgeType: BadgeType,
  awardedBy?: string,
  reason?: string,
): Promise<boolean> {
  const existing = await prisma.badge.findUnique({
    where: { userId_guildId_badgeType: { userId, guildId, badgeType } },
  });

  if (existing) return false;

  await prisma.badge.create({
    data: {
      userId,
      guildId,
      badgeType,
      awardedBy: awardedBy ?? null,
      reason: reason ?? null,
    },
  });

  await updateBadgeView(userId, guildId);
  return true;
}

/**
 * Award a badge manually (admin/leader action).
 */
export async function awardManualBadge(
  userId: string,
  guildId: string,
  badgeType: BadgeType,
  awardedBy: string,
  reason?: string,
): Promise<boolean> {
  return awardBadge(userId, guildId, badgeType, awardedBy, reason);
}

/**
 * Get all badges for a player in a guild.
 */
export async function getBadges(
  userId: string,
  guildId: string,
): Promise<BadgeRecord[]> {
  const badges = await prisma.badge.findMany({
    where: { userId, guildId },
    select: {
      badgeType: true,
      earnedAt: true,
      awardedBy: true,
      reason: true,
    },
    orderBy: { earnedAt: 'desc' },
  });

  return badges;
}

/**
 * Get the emoji representation for a badge type.
 */
export function getBadgeEmoji(badgeType: BadgeType): string {
  const emojiMap: Record<BadgeType, string> = {
    PERFECT_ATTENDANCE: '\u{1F3C6}',   // 🏆
    TANK_MAIN: '\u{1F6E1}\uFE0F',      // 🛡️
    HEALER_HERO: '\u{1F49A}',          // 💚
    DAMAGE_DEALER: '\u2694\uFE0F',     // ⚔️
    SHARPSHOOTER: '\u{1F3AF}',         // 🎯
    ALWAYS_ON_TIME: '\u23F0',          // ⏰
    EARLY_BIRD: '\u{1F680}',           // 🚀
    TEAM_PLAYER: '\u{1F465}',          // 👥
    RELIABLE_MEMBER: '\u{1F31F}',      // 🌟
    RISING_STAR: '\u{1F4C8}',          // 📈
    VETERAN_RAIDER: '\u{1F3AE}',       // 🎮
    LEADERS_CHOICE: '\u{1F451}',       // 👑
  };

  return emojiMap[badgeType] ?? '';
}

// --- Individual Badge Check Functions ---

/**
 * PERFECT_ATTENDANCE: 10 consecutive raids with 'attending' status.
 */
export async function checkPerfectAttendance(
  userId: string,
  guildId: string,
): Promise<boolean> {
  const records = await prisma.raidAttendance.findMany({
    where: { userId, guildId },
    include: { raid: { select: { raidDate: true } } },
    orderBy: { raid: { raidDate: 'desc' } },
  });

  let consecutive = 0;
  for (const r of records) {
    if (r.status === 'attending') {
      consecutive++;
      if (consecutive >= 10) return true;
    } else {
      break;
    }
  }

  return false;
}

/**
 * TANK_MAIN: 5 raids as Tank role.
 */
export async function checkTankMain(
  userId: string,
  guildId: string,
): Promise<boolean> {
  return checkRoleCount(userId, guildId, 'Tank', 5);
}

/**
 * HEALER_HERO: 5 raids as Healer role.
 */
export async function checkHealerHero(
  userId: string,
  guildId: string,
): Promise<boolean> {
  return checkRoleCount(userId, guildId, 'Healer', 5);
}

/**
 * DAMAGE_DEALER: 5 raids as DPS (Melee).
 */
export async function checkDamageDealer(
  userId: string,
  guildId: string,
): Promise<boolean> {
  return checkRoleCount(userId, guildId, 'Melee', 5);
}

/**
 * SHARPSHOOTER: 5 raids as Ranged DPS.
 */
export async function checkSharpshooter(
  userId: string,
  guildId: string,
): Promise<boolean> {
  return checkRoleCount(userId, guildId, 'Ranged', 5);
}

/**
 * ALWAYS_ON_TIME: 5 raids with 'attending' status (never 'late').
 * Checks the most recent 5 raids and requires all to be 'attending'.
 */
export async function checkAlwaysOnTime(
  userId: string,
  guildId: string,
): Promise<boolean> {
  const records = await prisma.raidAttendance.findMany({
    where: {
      userId,
      guildId,
      status: { in: ['attending', 'late'] },
    },
    include: { raid: { select: { raidDate: true } } },
    orderBy: { raid: { raidDate: 'desc' } },
  });

  if (records.length < 5) return false;

  // Check the most recent 5 raids where player attended (attending or late)
  const recent5 = records.slice(0, 5);
  return recent5.every((r) => r.status === 'attending');
}

/**
 * EARLY_BIRD: Was the first to respond to any raid in the guild.
 * Checks the most recent raid the player attended.
 */
export async function checkEarlyBird(
  userId: string,
  guildId: string,
): Promise<boolean> {
  // Find the most recent raid this user attended
  const userAttendance = await prisma.raidAttendance.findMany({
    where: {
      userId,
      guildId,
      status: { in: ['attending', 'late'] },
      respondedAt: { not: null },
    },
    include: { raid: { select: { id: true, raidDate: true } } },
    orderBy: { raid: { raidDate: 'desc' } },
    take: 1,
  });

  if (userAttendance.length === 0) return false;

  const latestRaid = userAttendance[0];

  // Find the first responder for this raid
  const firstResponder = await prisma.raidAttendance.findFirst({
    where: {
      raidId: latestRaid.raidId,
      respondedAt: { not: null },
    },
    orderBy: { respondedAt: 'asc' },
    select: { userId: true },
  });

  return firstResponder?.userId === userId;
}

/**
 * TEAM_PLAYER: Has played 3 or more different roles across raids.
 */
export async function checkTeamPlayer(
  userId: string,
  guildId: string,
): Promise<boolean> {
  const records = await prisma.raidAttendance.findMany({
    where: {
      userId,
      guildId,
      status: { in: ['attending', 'late'] },
    },
    select: { wowClass: true, wowSpec: true },
  });

  const uniqueRoles = new Set<WoWRole>();
  for (const r of records) {
    const role = getSpecRole(r.wowClass, r.wowSpec);
    if (role) uniqueRoles.add(role);
  }

  return uniqueRoles.size >= 3;
}

/**
 * RELIABLE_MEMBER: 95%+ attendance rate over the last 30 days.
 * Requires at least 5 raids in the period.
 */
export async function checkReliableMember(
  userId: string,
  guildId: string,
): Promise<boolean> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const records = await prisma.raidAttendance.findMany({
    where: {
      userId,
      guildId,
      raid: { raidDate: { gte: cutoff } },
    },
    select: { status: true },
  });

  if (records.length < 5) return false;

  const attended = records.filter(
    (r) => r.status === 'attending' || r.status === 'late',
  ).length;
  const rate = (attended / records.length) * 100;

  return rate >= 95;
}

/**
 * RISING_STAR: 30% improvement in attendance rate compared to 30 days ago.
 * Compares the most recent 30 days to the 30 days before that.
 */
export async function checkRisingStar(
  userId: string,
  guildId: string,
): Promise<boolean> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [recentRecords, olderRecords] = await Promise.all([
    prisma.raidAttendance.findMany({
      where: {
        userId,
        guildId,
        raid: { raidDate: { gte: thirtyDaysAgo } },
      },
      select: { status: true },
    }),
    prisma.raidAttendance.findMany({
      where: {
        userId,
        guildId,
        raid: { raidDate: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      },
      select: { status: true },
    }),
  ]);

  // Need data in both periods
  if (recentRecords.length < 3 || olderRecords.length < 3) return false;

  const recentRate = calculateAttendanceRate(recentRecords);
  const olderRate = calculateAttendanceRate(olderRecords);

  // 30% improvement (absolute points, not relative)
  return recentRate - olderRate >= 30;
}

/**
 * VETERAN_RAIDER: 25 total raids attended.
 */
export async function checkVeteranRaider(
  userId: string,
  guildId: string,
): Promise<boolean> {
  const count = await prisma.raidAttendance.count({
    where: {
      userId,
      guildId,
      status: { in: ['attending', 'late'] },
    },
  });

  return count >= 25;
}

// --- Helper Functions ---

/**
 * Check if a player has attended at least `threshold` raids as a specific role.
 */
async function checkRoleCount(
  userId: string,
  guildId: string,
  role: WoWRole,
  threshold: number,
): Promise<boolean> {
  const records = await prisma.raidAttendance.findMany({
    where: {
      userId,
      guildId,
      status: { in: ['attending', 'late'] },
    },
    select: { wowClass: true, wowSpec: true },
  });

  const roleCount = records.filter(
    (r) => getSpecRole(r.wowClass, r.wowSpec) === role,
  ).length;

  return roleCount >= threshold;
}

/**
 * Calculate attendance rate from a set of records.
 */
function calculateAttendanceRate(
  records: Array<{ status: string }>,
): number {
  if (records.length === 0) return 0;
  const attended = records.filter(
    (r) => r.status === 'attending' || r.status === 'late',
  ).length;
  return (attended / records.length) * 100;
}

/**
 * Update the denormalized PlayerBadgeView for quick embed rendering.
 */
async function updateBadgeView(
  userId: string,
  guildId: string,
): Promise<void> {
  const badges = await prisma.badge.findMany({
    where: { userId, guildId },
    select: { badgeType: true },
  });

  const badgeTypes = badges.map((b) => b.badgeType);

  await prisma.playerBadgeView.upsert({
    where: { userId_guildId: { userId, guildId } },
    update: { badges: JSON.stringify(badgeTypes) },
    create: {
      userId,
      guildId,
      badges: JSON.stringify(badgeTypes),
    },
  });
}
