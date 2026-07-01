import { EmbedBuilder } from 'discord.js';
import { t, getTranslations } from './localization';
import { getTrendEmoji, formatResponseTime } from './attendanceAnalytics';
import type { PlayerStats, PlayerRoleDistribution, AttendanceHistoryEntry } from './attendanceAnalytics';
import { VERSION } from './version';

/**
 * Format a role name with emoji and localized label.
 */
function formatRoleName(role: string, language: string): string {
  const trans = getTranslations(language);

  switch (role) {
    case 'Tank':
      return `🛡️ ${trans.tank}`;
    case 'Healer':
      return `💚 ${trans.heal}`;
    case 'Heal':
      return `💚 ${trans.heal}`;
    case 'Melee':
      return `⚔️ ${trans.compositionMeleeDps}`;
    case 'Ranged':
      return `🏹 ${trans.compositionRangedDps}`;
    default:
      return role;
  }
}

/**
 * Format an attendance stats embed for a player.
 *
 * @param playerName - Display name of the player
 * @param stats - Calculated player statistics
 * @param roleDistribution - Player's role distribution
 * @param recentRaids - Last N raids (already sliced)
 * @param period - Time period string ('month', 'quarter', 'all')
 * @param language - Language code ('en' or 'de')
 * @returns EmbedBuilder ready to send
 */
export function formatAttendanceEmbed(
  playerName: string,
  stats: PlayerStats,
  roleDistribution: PlayerRoleDistribution,
  recentRaids: AttendanceHistoryEntry[],
  period: string,
  language: string,
): EmbedBuilder {
  const trans = getTranslations(language);

  // Determine embed color based on attendance rate
  const color = stats.attendanceRate >= 80
    ? 0x00ae86  // green
    : stats.attendanceRate >= 50
      ? 0xffd700  // yellow
      : 0xff4500; // red

  const periodLabel = getPeriodLabel(period, language);
  const trendEmoji = getTrendEmoji(stats.trend);

  const embed = new EmbedBuilder()
    .setTitle(t(language, 'attendanceRecord', { player: playerName }))
    .setColor(color)
    .addFields(
      {
        name: trans.attendanceRaidsInvited,
        value: `${stats.totalRaidsInvited}`,
        inline: true,
      },
      {
        name: trans.attendanceRaidsAttended,
        value: `${stats.raidsAttended} (${stats.attendanceRate}%)`,
        inline: true,
      },
      { name: '\u200B', value: '\u200B', inline: true },
      {
        name: trans.attendanceOptedOut,
        value: `${stats.optedOutCount}`,
        inline: true,
      },
      {
        name: trans.attendanceRunningLate,
        value: `${stats.lateCount}`,
        inline: true,
      },
      { name: '\u200B', value: '\u200B', inline: true },
      {
        name: trans.attendanceReliabilityScore,
        value: `${stats.reliability.emoji} ${stats.reliability.label}`,
        inline: true,
      },
      {
        name: trans.attendanceTrend,
        value: `${trendEmoji} ${capitalize(stats.trend)}`,
        inline: true,
      },
      { name: '\u200B', value: '\u200B', inline: true },
    );

  // Role distribution
  if (roleDistribution.mainRole) {
    embed.addFields({
      name: trans.attendanceMainRole,
      value: formatRoleName(roleDistribution.mainRole, language),
      inline: true,
    });
  }

  if (roleDistribution.altRoles.length > 0) {
    embed.addFields({
      name: trans.attendanceAltRoles,
      value: roleDistribution.altRoles.map(role => formatRoleName(role, language)).join(', '),
      inline: true,
    });
  }

  // Average response time
  embed.addFields({
    name: trans.attendanceAvgResponseTime,
    value: formatResponseTime(stats.averageResponseTimeMs),
    inline: true,
  });

  // Recent raids
  if (recentRaids.length > 0) {
    const recentText = recentRaids
      .map((raid) => {
        const responseTime = raid.respondedAt || raid.raidDate;
        const dateTimeStr = responseTime.toISOString().slice(0, 16).replace('T', ' ');
        const attended = raid.status === 'attending' || raid.status === 'late';
        const statusIcon = attended ? '✅' : '❌';
        const raidName = raid.raidDescription || 'Raid';
        return `${statusIcon} ${dateTimeStr} - ${raidName}`;
      })
      .join('\n');

    embed.addFields({
      name: trans.attendanceRecentRaids,
      value: recentText,
      inline: false,
    });
  }

  embed.addFields({ name: trans.links, value: '[Web](https://raidpresence.dev) • [Vote](https://raidpresence.dev/vote)', inline: false });

  embed.setFooter({ text: `${periodLabel} | v${VERSION}` });
  embed.setTimestamp();

  return embed;
}

/**
 * Get a localized period label for the footer.
 */
function getPeriodLabel(period: string, language: string): string {
  const trans = getTranslations(language);
  switch (period) {
    case 'month':
      return trans.attendancePeriodMonth;
    case 'quarter':
      return trans.attendancePeriodQuarter;
    case 'all':
      return trans.attendancePeriodAll;
    default:
      return trans.attendancePeriodMonth;
  }
}

/**
 * Capitalize the first letter of a string.
 */
function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
