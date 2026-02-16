import { EmbedBuilder } from 'discord.js';
import { ArchiveRaidSummary } from './archiveManager';
import { getTranslations, t } from './localization';
import { VERSION } from './version';

/**
 * Format archive search results into an embed.
 * 
 * @param results - Array of archived raid summaries
 * @param query - Search query used (for display)
 * @param period - Time period filter used (for display)
 * @param language - Language code (en/de)
 * @returns EmbedBuilder for search results
 */
export function formatArchiveSearchEmbed(
  results: ArchiveRaidSummary[],
  query: string | null,
  period: string | null,
  language: string
): EmbedBuilder {
  const trans = getTranslations(language);

  const embed = new EmbedBuilder()
    .setColor(0x95a5a6) // Gray for archive
    .setTitle(`📦 ${trans.archiveSearchResults}`)
    .setTimestamp(new Date());

  // Add search filter info
  let filterInfo = '';
  if (query) filterInfo += `**${t(language, 'archiveSearchQuery')}:** ${query}\n`;
  if (period) filterInfo += `**${t(language, 'archiveSearchPeriod')}:** ${formatPeriodLabel(period, language)}`;
  if (filterInfo) {
    embed.setDescription(filterInfo);
  }

  // If no results
  if (results.length === 0) {
    embed.addFields({
      name: t(language, 'archiveSearchNone'),
      value: t(language, 'archiveSearchNoResults'),
      inline: false,
    });
    return embed;
  }

   // Add up to 10 results per embed (Discord field limit)
   const displayResults = results.slice(0, 10);
   for (const raid of displayResults) {
     const raiderNames = raid.participantNames.join(', ');
     const fieldValue = 
       `**${t(language, 'archiveDate')}:** <t:${Math.floor(raid.raidDate.getTime() / 1000)}:d>\n` +
       `**${t(language, 'archiveAttendance')}:** ${raid.attendedCount}/${raid.totalInvited} (${raid.attendancePercent}%)\n` +
       `**${t(language, 'archiveParticipants')}:** ${raiderNames || 'N/A'}\n` +
       `**${t(language, 'archiveRaidId')}:** \`${raid.raidId}\``;

     embed.addFields({
       name: raid.description || 'Unnamed Raid',
       value: fieldValue,
       inline: false,
     });
   }

    // Add info about result count
    if (results.length > 10) {
      embed.setFooter({ 
        text: `${t(language, 'archiveShowingResults', { total: results.length.toString() })} | v${VERSION}`
      });
    } else {
      // For this case, we need a localized message about found raids
      // Handle pluralization: 1 result uses singular form, multiple uses plural form
      const count = results.length;
      embed.setFooter({ 
        text: (count === 1 
          ? t(language, 'archiveFoundCountSingular')
          : t(language, 'archiveFoundCount', { count: count.toString() })) + ` | v${VERSION}`
      });
    }

    embed.addFields({ name: '\u200b', value: '[Web](https://raidpresence.dev)', inline: true });

  return embed;
}

/**
 * Format a notification embed when a raid is archived.
 * 
 * @param raidName - Name/description of the raid
 * @param raidDate - Date of the raid
 * @param archiveChannelId - ID of the archive channel
 * @param language - Language code (en/de)
 * @returns EmbedBuilder for archive notification
 */
export function formatArchiveNotificationEmbed(
   raidName: string,
   raidDate: Date,
   archiveChannelId: string,
   language: string
): EmbedBuilder {
   const trans = getTranslations(language);

    return new EmbedBuilder()
      .setColor(0x95a5a6)
      .setTitle(`📦 ${trans.raidArchived}`)
      .setDescription(
        `**${raidName}** from <t:${Math.floor(raidDate.getTime() / 1000)}:F>\n\n` +
        `${t(language, 'archiveMovedNotification', { channel: `<#${archiveChannelId}>` })}`
      )
      .addFields({ name: '\u200b', value: '[Web](https://raidpresence.dev)', inline: true })
      .setFooter({ text: `v${VERSION}` })
      .setTimestamp(new Date());
}

/**
 * Convert a period filter value to a human-readable label.
 */
function formatPeriodLabel(period: string, language: string): string {
  const periodMap: Record<string, string> = {
    '7': language === 'de' ? 'Letzte 7 Tage' : 'Last 7 days',
    '30': language === 'de' ? 'Letzte 30 Tage' : 'Last 30 days',
    '90': language === 'de' ? 'Letzte 90 Tage' : 'Last 90 days',
    'all': language === 'de' ? 'Gesamt' : 'All time',
  };

  return periodMap[period] || period;
}
