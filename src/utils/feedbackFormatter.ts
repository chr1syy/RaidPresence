import { EmbedBuilder } from 'discord.js';
import { t, getTranslations } from './localization';
import type { RaidFeedbackSummary, GuildMorale } from './feedbackAnalyzer';

/**
 * Format a feedback summary embed for a single raid.
 *
 * @param raidDescription - Description/title of the raid
 * @param raidDate - Date of the raid
 * @param summary - Feedback analysis summary
 * @param language - Language code ('en' or 'de')
 * @returns EmbedBuilder ready to send
 */
export function formatRaidFeedbackEmbed(
  raidDescription: string,
  raidDate: Date,
  summary: RaidFeedbackSummary,
  language: string,
): EmbedBuilder {
  const trans = getTranslations(language);

  // Determine embed color based on quality score
  const color = summary.qualityScore >= 80
    ? 0x00ae86  // green
    : summary.qualityScore >= 50
      ? 0xffd700  // yellow
      : 0xff4500; // red

  const embed = new EmbedBuilder()
    .setTitle(t(language, 'raidFeedbackSummary', { raid: raidDescription }))
    .setColor(color)
    .setDescription(`**${trans.moodScore}:** ${summary.qualityScore}/100`)
    .addFields(
      {
        name: t(language, 'feedbackBreakdown'),
        value: formatMoodBreakdown(summary.moodCounts, summary.totalFeedback, language),
        inline: false,
      },
    );

  if (summary.commonWords.length > 0) {
    embed.addFields({
      name: t(language, 'commonWords'),
      value: summary.commonWords.slice(0, 5).join(', '),
      inline: true,
    });
  }

  // Add date info
  const dateStr = raidDate.toISOString().split('T')[0];
  embed.setFooter({ text: `${trans.date}: ${dateStr}` });
  embed.setTimestamp();

  return embed;
}

/**
 * Format a guild morale trends embed.
 *
 * @param guildName - Name of the guild
 * @param morale - Guild morale analysis
 * @param periodDays - Number of days analyzed
 * @param language - Language code ('en' or 'de')
 * @returns EmbedBuilder ready to send
 */
export function formatGuildMoraleEmbed(
  guildName: string,
  morale: GuildMorale,
  periodDays: number,
  language: string,
): EmbedBuilder {
  const trans = getTranslations(language);

  // Determine embed color based on average sentiment
  const color = morale.averageSentiment >= 0.8
    ? 0x00ae86  // green
    : morale.averageSentiment >= 0.5
      ? 0xffd700  // yellow
      : 0xff4500; // red

  const trendEmoji = getMoraleTrendEmoji(morale.trend);
  const trendText = getMoraleTrendText(morale.trend, language);

  const embed = new EmbedBuilder()
    .setTitle(t(language, 'guildMorale', { guild: guildName }))
    .setColor(color)
    .setDescription(
      `**${trans.overallSentiment}:** ${(morale.averageSentiment * 100).toFixed(1)}%\n` +
      `**${trans.trend}:** ${trendEmoji} ${trendText}`
    );

  // Best raids
  if (morale.bestRaids.length > 0) {
    const bestText = morale.bestRaids
      .slice(0, 3)
      .map(raid => {
        const dateStr = raid.raidDate.toISOString().split('T')[0];
        const name = raid.description || 'Unnamed Raid';
        return `😊 ${(raid.sentiment * 100).toFixed(0)}% - ${dateStr}: ${name}`;
      })
      .join('\n');

    embed.addFields({
      name: t(language, 'bestRaids'),
      value: bestText,
      inline: false,
    });
  }

  // Worst raids
  if (morale.worstRaids.length > 0) {
    const worstText = morale.worstRaids
      .slice(0, 3)
      .map(raid => {
        const dateStr = raid.raidDate.toISOString().split('T')[0];
        const name = raid.description || 'Unnamed Raid';
        return `😞 ${(raid.sentiment * 100).toFixed(0)}% - ${dateStr}: ${name}`;
      })
      .join('\n');

    embed.addFields({
      name: t(language, 'worstRaids'),
      value: worstText,
      inline: false,
    });
  }

  // Role morale
  if (morale.roleMorale.length > 0) {
    const roleText = morale.roleMorale
      .map(role => {
        const roleName = getRoleName(role.role, language);
        const sentimentPercent = (role.averageSentiment * 100).toFixed(0);
        return `${roleName}: ${sentimentPercent}% (${role.feedbackCount} feedback)`;
      })
      .join('\n');

    embed.addFields({
      name: t(language, 'roleMorale'),
      value: roleText,
      inline: false,
    });
  }

  const periodText = t(language, 'lastDays', { days: periodDays });
  embed.setFooter({ text: periodText });
  embed.setTimestamp();

  return embed;
}

/**
 * Format mood breakdown as a text-based bar chart.
 */
function formatMoodBreakdown(
  moodCounts: { great: number; okay: number; frustrating: number },
  totalFeedback: number,
  language: string,
): string {
  if (totalFeedback === 0) {
    return t(language, 'noFeedback');
  }

  const trans = getTranslations(language);
  const greatPercent = Math.round((moodCounts.great / totalFeedback) * 100);
  const okayPercent = Math.round((moodCounts.okay / totalFeedback) * 100);
  const frustratingPercent = Math.round((moodCounts.frustrating / totalFeedback) * 100);

  return (
    `${trans.feedbackGreat}: ${moodCounts.great} (${greatPercent}%)\n` +
    `${trans.feedbackOkay}: ${moodCounts.okay} (${okayPercent}%)\n` +
    `${trans.feedbackFrustrating}: ${moodCounts.frustrating} (${frustratingPercent}%)`
  );
}

/**
 * Get emoji for morale trend.
 */
function getMoraleTrendEmoji(trend: 'improving' | 'stable' | 'declining'): string {
  switch (trend) {
    case 'improving': return '📈';
    case 'stable': return '➡️';
    case 'declining': return '📉';
  }
}

/**
 * Get localized text for morale trend.
 */
function getMoraleTrendText(trend: 'improving' | 'stable' | 'declining', language: string): string {
  switch (trend) {
    case 'improving': return t(language, 'trendImproving');
    case 'stable': return t(language, 'trendStable');
    case 'declining': return t(language, 'trendDeclining');
  }
}

/**
 * Get localized role name.
 */
function getRoleName(role: string, language: string): string {
  const trans = getTranslations(language);
  switch (role) {
    case 'Tank': return trans.tank;
    case 'Healer': return trans.heal;
    case 'Melee DPS': return trans.melee;
    case 'Ranged DPS': return trans.ranged;
    default: return role;
  }
}