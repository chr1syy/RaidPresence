import { EmbedBuilder } from 'discord.js';
import { BadgeType } from '@prisma/client';
import { t } from './localization';
import { getBadgeEmoji, getBadges, type BadgeRecord } from './badgeManager';

export { getBadgeEmoji } from './badgeManager';

/**
 * Badge name localization key map.
 */
const badgeNameKeys: Record<BadgeType, string> = {
  PERFECT_ATTENDANCE: 'badgePerfectAttendance',
  TANK_MAIN: 'badgeTankMain',
  HEALER_HERO: 'badgeHealerHero',
  DAMAGE_DEALER: 'badgeDamageDealer',
  SHARPSHOOTER: 'badgeSharpshooter',
  ALWAYS_ON_TIME: 'badgeAlwaysOnTime',
  EARLY_BIRD: 'badgeEarlyBird',
  TEAM_PLAYER: 'badgeTeamPlayer',
  RELIABLE_MEMBER: 'badgeReliableMember',
  RISING_STAR: 'badgeRisingStar',
  VETERAN_RAIDER: 'badgeVeteranRaider',
  LEADERS_CHOICE: 'badgeLeadersChoice',
};

/**
 * Badge description localization key map.
 */
const badgeDescKeys: Record<BadgeType, string> = {
  PERFECT_ATTENDANCE: 'badgeDescPerfectAttendance',
  TANK_MAIN: 'badgeDescTankMain',
  HEALER_HERO: 'badgeDescHealerHero',
  DAMAGE_DEALER: 'badgeDescDamageDealer',
  SHARPSHOOTER: 'badgeDescSharpshooter',
  ALWAYS_ON_TIME: 'badgeDescAlwaysOnTime',
  EARLY_BIRD: 'badgeDescEarlyBird',
  TEAM_PLAYER: 'badgeDescTeamPlayer',
  RELIABLE_MEMBER: 'badgeDescReliableMember',
  RISING_STAR: 'badgeDescRisingStar',
  VETERAN_RAIDER: 'badgeDescVeteranRaider',
  LEADERS_CHOICE: 'badgeDescLeadersChoice',
};

/**
 * Get the localized human-readable name for a badge type.
 */
export function getBadgeName(badgeType: BadgeType, language: string): string {
  const key = badgeNameKeys[badgeType];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return t(language, key as any);
}

/**
 * Get the localized human-readable description for a badge type.
 */
export function getBadgeDescription(badgeType: BadgeType, language: string): string {
  const key = badgeDescKeys[badgeType];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return t(language, key as any);
}

/**
 * Get a compact emoji string for a player's badges (e.g. "🏆🎮💚").
 * Reads badges from the database.
 *
 * @param maxBadges - Maximum number of badges to show (default: 3).
 *   If the player has more badges, a "+" indicator is appended.
 */
export async function formatPlayerBadgesForEmbed(
  userId: string,
  guildId: string,
  language: string,
  maxBadges: number = 3,
): Promise<string> {
  const badges = await getBadges(userId, guildId);

  if (badges.length === 0) return '';

  const emojis = badges
    .slice(0, maxBadges)
    .map((b) => getBadgeEmoji(b.badgeType))
    .join('');

  if (badges.length > maxBadges) {
    return `${emojis}+`;
  }

  return emojis;
}

/**
 * Build a detailed embed showing all badges for a player.
 * Each badge shows emoji, name, description, and earned date.
 */
export async function formatPlayerBadgesDetailed(
  userId: string,
  guildId: string,
  language: string,
  playerName?: string,
): Promise<EmbedBuilder> {
  const badges = await getBadges(userId, guildId);
  const displayName = playerName ?? userId;

  const embed = new EmbedBuilder()
    .setTitle(t(language, 'badgesTitle', { player: displayName }))
    .setColor(0x00ae86)
    .setTimestamp();

  if (badges.length === 0) {
    embed.setDescription(t(language, 'badgesNoBadges'));
    return embed;
  }

  for (const badge of badges) {
    const emoji = getBadgeEmoji(badge.badgeType);
    const name = getBadgeName(badge.badgeType, language);
    const desc = getBadgeDescription(badge.badgeType, language);
    const earnedDate = `<t:${Math.floor(badge.earnedAt.getTime() / 1000)}:d>`;

    let value = `${desc}\n${t(language, 'badgesEarnedOn')}: ${earnedDate}`;

    if (badge.awardedBy) {
      value += `\n${t(language, 'badgesAwardedBy')}: <@${badge.awardedBy}>`;
    }
    if (badge.reason) {
      value += `\n${t(language, 'badgesReason')}: ${badge.reason}`;
    }

    embed.addFields({ name: `${emoji} ${name}`, value, inline: false });
  }

  return embed;
}
