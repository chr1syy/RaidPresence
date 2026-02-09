import { EmbedBuilder } from 'discord.js';
import { t, getTranslations } from './localization';
import { getReliabilityScore } from './statsCalculator';
import type { RaidStats, GuildStats } from './statsCalculator';

/**
 * Minimal raid info needed to build a stats embed.
 */
export interface RaidInfo {
  id: string;
  description: string | null;
}

/**
 * Format a single-raid statistics embed.
 *
 * @param raid  - Basic raid info (id + description)
 * @param stats - Pre-calculated RaidStats
 * @param language - 'en' | 'de'
 * @returns EmbedBuilder ready to send
 */
export function formatRaidStatsEmbed(
  raid: RaidInfo,
  stats: RaidStats,
  language: string,
): EmbedBuilder {
  const trans = getTranslations(language);
  const reliability = getReliabilityScore(stats.attendanceRate);

  const embed = new EmbedBuilder()
    .setTitle(t(language, 'statsRaidTitle', { title: raid.description || 'Raid' }))
    .setColor(stats.attendanceRate >= 80 ? 0x00ae86 : stats.attendanceRate >= 50 ? 0xffd700 : 0xff4500)
    .addFields(
      {
        name: trans.statsAttendanceRate,
        value: `${stats.attendingCount}/${stats.totalMembers} (${stats.attendanceRate}%)`,
        inline: true,
      },
      {
        name: trans.statsReliability,
        value: `${reliability.emoji} ${reliability.label}`,
        inline: true,
      },
      { name: '\u200B', value: '\u200B', inline: true },
      {
        name: trans.statsAttending,
        value: `${stats.attendingCount}`,
        inline: true,
      },
      {
        name: trans.statsOptedOut,
        value: `${stats.optedOutCount}`,
        inline: true,
      },
      {
        name: trans.statsRunningLate,
        value: `${stats.lateCount}`,
        inline: true,
      },
      {
        name: trans.statsComposition,
        value: [
          `🛡️ ${trans.tank}: ${stats.composition.tanks}`,
          `💚 ${trans.heal}: ${stats.composition.healers}`,
          `⚔️ ${trans.melee}: ${stats.composition.melee}`,
          `🎯 ${trans.ranged}: ${stats.composition.ranged}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: trans.statsClassDistribution,
        value: stats.classDistribution.length > 0
          ? stats.classDistribution
              .slice(0, 10)
              .map((c) => `${c.className}: ${c.count}`)
              .join('\n')
          : '-',
        inline: true,
      },
    )
    .setFooter({ text: `Raid ID: ${raid.id}` })
    .setTimestamp();

  return embed;
}

/**
 * Format a guild-wide statistics embed.
 *
 * @param stats    - Pre-calculated GuildStats
 * @param period   - 'week' | 'month' | 'all'
 * @param language - 'en' | 'de'
 * @returns EmbedBuilder ready to send
 */
export function formatGuildStatsEmbed(
  stats: GuildStats,
  period: string,
  language: string,
): EmbedBuilder {
  const trans = getTranslations(language);

  const periodLabel = period === 'week'
    ? trans.statsPeriodWeek
    : period === 'all'
      ? trans.statsPeriodAll
      : trans.statsPeriodMonth;

  const embed = new EmbedBuilder()
    .setTitle(t(language, 'statsGuildTitle', { period: periodLabel }))
    .setColor(stats.averageAttendanceRate >= 80 ? 0x00ae86 : stats.averageAttendanceRate >= 50 ? 0xffd700 : 0xff4500)
    .addFields(
      {
        name: trans.statsTotalRaids,
        value: `${stats.totalRaids}`,
        inline: true,
      },
      {
        name: trans.statsAttendanceRate,
        value: `${stats.averageAttendanceRate}%`,
        inline: true,
      },
      {
        name: trans.statsTotalRaiders,
        value: `${stats.totalRaiders}`,
        inline: true,
      },
    );

  if (stats.topAttendees.length > 0) {
    const topList = stats.topAttendees
      .slice(0, 10)
      .map((p, i) => {
        const score = getReliabilityScore(p.attendanceRate);
        return `${i + 1}. ${p.username} — ${p.raidsAttended}/${p.totalRaids} (${p.attendanceRate}%) ${score.emoji}`;
      })
      .join('\n');

    embed.addFields({
      name: trans.statsTopAttendees,
      value: topList,
      inline: false,
    });
  }

  if (stats.classDistribution.length > 0) {
    embed.addFields({
      name: trans.statsClassDistribution,
      value: stats.classDistribution
        .slice(0, 10)
        .map((c) => `${c.className}: ${c.count}`)
        .join('\n'),
      inline: false,
    });
  }

  embed.setTimestamp();

  return embed;
}
