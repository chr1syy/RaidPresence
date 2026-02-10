import { EmbedBuilder, ColorResolvable } from 'discord.js';
import { CompositionAnalysis, GapAnalysis, SwapSuggestions, SuccessLikelihood } from './compositionAnalyzer';
import { getTranslations, t } from './localization';
import { ROLE_EMOJIS } from './wowData';

/**
 * Format a composition analysis into a Discord embed
 */
export function formatCompositionEmbed(
  raidName: string,
  analysis: CompositionAnalysis,
  gaps: GapAnalysis,
  suggestions: SwapSuggestions,
  likelihood: SuccessLikelihood,
  language: string = 'en'
): EmbedBuilder {
  const embed = new EmbedBuilder();
  const trans = getTranslations(language);

  // Color based on composition status
  const color = getCompositionColor(analysis.statusFlags);
  embed.setColor(color);

  // Title
  embed.setTitle(t(language, 'compositionAnalysis', { raid: raidName }));

  // Active players count
  embed.setDescription(`**${trans.compositionActivePlayers}:** ${analysis.activePlayers}`);

  // Current composition field
  // Handle division by zero: if no optimal melee+ranged, show "-" instead of NaN
  const optimalDpsTotal = analysis.optimal.melee + analysis.optimal.ranged;
  const optimalMelee = optimalDpsTotal > 0 
    ? Math.round(analysis.optimal.melee * (analysis.optimal.totalDps / optimalDpsTotal))
    : 0;
  const optimalRanged = optimalDpsTotal > 0 
    ? Math.round(analysis.optimal.ranged * (analysis.optimal.totalDps / optimalDpsTotal))
    : 0;

  const currentCompositionText = `
${ROLE_EMOJIS.TANK} ${trans.compositionTanks}: ${analysis.current.tanks}/${analysis.optimal.tanks}
${ROLE_EMOJIS.HEALER} ${trans.compositionHealers}: ${analysis.current.healers}/${analysis.optimal.healers}
⚔️ ${trans.compositionMeleeDps}: ${analysis.current.melee}/${optimalMelee}
🏹 ${trans.compositionRangedDps}: ${analysis.current.ranged}/${optimalRanged}
`.trim();

  embed.addFields({
    name: trans.compositionCurrentComposition,
    value: currentCompositionText,
    inline: true,
  });

  // Status field
  const statusText = getCompositionStatusText(analysis.statusFlags, language);
  embed.addFields({
    name: trans.compositionStatus,
    value: statusText,
    inline: true,
  });

  // Gaps section
  if (gaps.hasGaps || gaps.hasOverages) {
    const gapsText = gaps.gaps
      .map((gap) => {
        if (gap.difference < 0) {
          return `❌ ${t(language, 'compositionNeedMore', { count: Math.abs(gap.difference).toString(), role: gap.role })}`;
        } else if (gap.difference > 0) {
          return `⚠️ ${t(language, 'compositionExtraPlayers', { count: Math.abs(gap.difference).toString(), role: gap.role })}`;
        }
        return `✅ ${t(language, 'compositionCountFine', { role: gap.role })}`;
      })
      .join('\n');

    embed.addFields({
      name: trans.compositionRoleAnalysis,
      value: gapsText,
      inline: false,
    });
  }

  // Suggestions section
  if (suggestions.suggestions.length > 0) {
    const suggestionsText = suggestions.suggestions
      .slice(0, 5) // Show top 5 suggestions
      .map((suggestion) => {
        const roleEmoji = getRoleEmoji(suggestion.suggestedRole);
        const flexScore = Math.round(suggestion.flexibilityScore);
        return `${roleEmoji} **${suggestion.username}** (${suggestion.currentClass}) → ${suggestion.suggestedRole} (Flex: ${flexScore}%)`;
      })
      .join('\n');

    embed.addFields({
      name: trans.compositionPlayerSuggestions,
      value: suggestionsText || trans.compositionNoSuggestions,
      inline: false,
    });
  }

  // Success likelihood
  const successText = `${likelihood.percentage}% - ${likelihood.label}
${trans.compositionFactors}:
${likelihood.factors.map((f) => `• ${f}`).join('\n')}`;

  embed.addFields({
    name: trans.compositionSuccessLikelihood,
    value: successText,
    inline: false,
  });

  // Footer
  embed.setFooter({
    text: `${trans.compositionAnalyzedAt} ${new Date().toLocaleString()}`,
  });

  return embed;
}

/**
 * Get the appropriate color for composition status
 */
function getCompositionColor(statusFlags: string[]): ColorResolvable {
  if (statusFlags.includes('READY')) return 0x2ecc71; // Green
  if (statusFlags.some((f) => f.startsWith('NEEDS'))) return 0xf39c12; // Orange
  if (statusFlags.some((f) => f.startsWith('OVERSTOCKED'))) return 0x3498db; // Blue
  return 0x95a5a6; // Gray
}

/**
 * Get human-readable status text
 */
function getCompositionStatusText(statusFlags: string[], language: string): string {
   const trans = getTranslations(language);
   const flagTexts: string[] = [];

   for (const flag of statusFlags) {
     if (flag === 'READY') {
       flagTexts.push(trans.compositionReady);
     } else if (flag === 'NEEDS_TANKS') {
       flagTexts.push(trans.compositionNeedsTanks);
     } else if (flag === 'NEEDS_HEALERS') {
       flagTexts.push(trans.compositionNeedsHealers);
     } else if (flag === 'NEEDS_DPS') {
       flagTexts.push(trans.compositionNeedsDps);
     } else if (flag === 'OVERSTOCKED_TANKS') {
       flagTexts.push(trans.compositionOverstockedTanks);
     } else if (flag === 'OVERSTOCKED_HEALERS') {
       flagTexts.push(trans.compositionOverstockedHealers);
     } else if (flag === 'OVERSTOCKED_DPS') {
       flagTexts.push(trans.compositionOverstockedDps);
     }
   }

   return flagTexts.length > 0 ? flagTexts.join('\n') : trans.compositionUnknown;
}

/**
 * Get emoji for a role
 */
function getRoleEmoji(role: string): string {
  switch (role) {
    case 'Tank':
      return ROLE_EMOJIS.TANK;
    case 'Healer':
      return ROLE_EMOJIS.HEALER;
    case 'Melee':
    case 'Ranged':
      return ROLE_EMOJIS.DPS;
    default:
      return '❓';
  }
}
