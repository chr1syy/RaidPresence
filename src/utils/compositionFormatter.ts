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
  const trans = getTranslations(language);
  const embed = new EmbedBuilder();

  // Color based on composition status
  const color = getCompositionColor(analysis.statusFlags);
  embed.setColor(color);

   // Title
   embed.setTitle(t(language, 'compositionAnalysis', { raid: raidName }));

  // Active players count
  embed.setDescription(`**Active Players:** ${analysis.activePlayers}`);

  // Current composition field
  const currentCompositionText = `
${ROLE_EMOJIS.TANK} Tanks: ${analysis.current.tanks}/${analysis.optimal.tanks}
${ROLE_EMOJIS.HEALER} Healers: ${analysis.current.healers}/${analysis.optimal.healers}
⚔️ Melee DPS: ${analysis.current.melee}/${Math.round(analysis.optimal.melee * (analysis.optimal.totalDps / (analysis.optimal.melee + analysis.optimal.ranged)))}
🏹 Ranged DPS: ${analysis.current.ranged}/${Math.round(analysis.optimal.ranged * (analysis.optimal.totalDps / (analysis.optimal.melee + analysis.optimal.ranged)))}
`.trim();

  embed.addFields({
    name: 'Current Composition',
    value: currentCompositionText,
    inline: true,
  });

  // Status field
  const statusText = getCompositionStatusText(analysis.statusFlags, language);
  embed.addFields({
    name: 'Status',
    value: statusText,
    inline: true,
  });

  // Gaps section
  if (gaps.hasGaps || gaps.hasOverages) {
    const gapsText = gaps.gaps
      .map((gap) => {
        if (gap.difference < 0) {
          return `❌ Need ${Math.abs(gap.difference)} more ${gap.role}(s)`;
        } else if (gap.difference > 0) {
          return `⚠️ ${Math.abs(gap.difference)} extra ${gap.role}(s)`;
        }
        return `✅ ${gap.role} count is fine`;
      })
      .join('\n');

    embed.addFields({
      name: 'Role Analysis',
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
      name: 'Player Suggestions',
      value: suggestionsText || 'No suggestions available',
      inline: false,
    });
  }

  // Success likelihood
  const successText = `${likelihood.percentage}% - ${likelihood.label}
Factors:
${likelihood.factors.map((f) => `• ${f}`).join('\n')}`;

  embed.addFields({
    name: 'Success Likelihood',
    value: successText,
    inline: false,
  });

  // Footer
  embed.setFooter({
    text: `Analyzed at ${new Date().toLocaleString()}`,
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
  const flagTexts: string[] = [];

  for (const flag of statusFlags) {
    if (flag === 'READY') {
      flagTexts.push('✅ Raid composition is ready!');
    } else if (flag === 'NEEDS_TANKS') {
      flagTexts.push('❌ Need more tanks');
    } else if (flag === 'NEEDS_HEALERS') {
      flagTexts.push('❌ Need more healers');
    } else if (flag === 'NEEDS_DPS') {
      flagTexts.push('❌ Need more DPS');
    } else if (flag === 'OVERSTOCKED_TANKS') {
      flagTexts.push('⚠️ Too many tanks');
    } else if (flag === 'OVERSTOCKED_HEALERS') {
      flagTexts.push('⚠️ Too many healers');
    } else if (flag === 'OVERSTOCKED_DPS') {
      flagTexts.push('⚠️ Too many DPS');
    }
  }

  return flagTexts.length > 0 ? flagTexts.join('\n') : 'Status unknown';
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
