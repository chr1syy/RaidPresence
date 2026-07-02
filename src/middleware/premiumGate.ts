import { ChatInputCommandInteraction, ButtonInteraction, ModalSubmitInteraction, EmbedBuilder } from 'discord.js';
import { getTier, hasFeature, FEATURE_TIERS, PremiumFeature, PremiumTier } from '../services/entitlementService';
import { t, Translations } from '../utils/localization';
import { VERSION } from '../utils/version';

/** Gold accent used across all premium surfaces. */
export const PREMIUM_COLOR = 0xf1c40f;

const TIER_NAME_KEYS: Record<PremiumTier, 'premiumTierFree' | 'premiumTierPremium' | 'premiumTierPro'> = {
  FREE: 'premiumTierFree',
  PREMIUM: 'premiumTierPremium',
  PRO: 'premiumTierPro',
};

/** Feature → localization key for its human-readable display name. */
const FEATURE_NAME_KEYS: Record<PremiumFeature, keyof Translations> = {
  'raid.optout_reason': 'featureRaidOptoutReason',
  'raid.archive': 'featureRaidArchive',
  'raid.recurring': 'featureRaidRecurring',
  'raid.template': 'featureRaidTemplate',
  'raid.integrations': 'featureRaidIntegrations',
  'stats.full_history': 'featureStatsFullHistory',
  'stats.analytics': 'featureStatsAnalytics',
  'stats.export': 'featureStatsExport',
};

/** Localized display name for a tier (e.g. "Premium"). */
function tierName(tier: PremiumTier, language: string): string {
  return t(language, TIER_NAME_KEYS[tier]);
}

/** Localized display name for a gated feature (e.g. "Raid Archive"). */
function featureName(feature: PremiumFeature, language: string): string {
  return t(language, FEATURE_NAME_KEYS[feature]);
}

/**
 * Builds the reusable premium upsell embed shown when a free (or under-tier)
 * guild hits a gated feature. Kept presentation-only so it can be reused by
 * gates, buttons, and future surfaces.
 */
export function premiumUpsellEmbed(
  feature: PremiumFeature,
  currentTier: PremiumTier,
  requiredTier: PremiumTier,
  language: string,
): EmbedBuilder {
  const localizedFeatureName = featureName(feature, language);
  const requiredTierName = tierName(requiredTier, language);

  return new EmbedBuilder()
    .setColor(PREMIUM_COLOR)
    .setTitle(t(language, 'premiumUpsellTitle', { feature: localizedFeatureName, tier: requiredTierName }))
    .setDescription(
      `${t(language, 'premiumUpsellBody', { feature: localizedFeatureName, tier: requiredTierName })}\n\n` +
        t(language, 'premiumUpsellHowTo'),
    )
    .addFields(
      { name: t(language, 'premiumUpsellCurrentPlan'), value: tierName(currentTier, language), inline: true },
      { name: t(language, 'premiumUpsellRequiredPlan'), value: requiredTierName, inline: true },
    )
    .setFooter({ text: `RaidPresence • v${VERSION}` });
}

/**
 * Subtle one-line free-tier upsell hint, rendered as Discord subtext (`-# …`).
 * Append to message content on free-tier responses for a consistent, low-key nudge.
 */
export function premiumFooterHint(language: string): string {
  return t(language, 'premiumFooterHint');
}

/**
 * Checks if a guild has access to a premium feature.
 * If blocked, sends an ephemeral upsell embed and returns false.
 */
export async function gateFeature(
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction,
  feature: PremiumFeature,
  language: string,
): Promise<boolean> {
  const guildId = interaction.guildId;
  if (!guildId) return false;

  const tier = await getTier(guildId);

  if (hasFeature(tier, feature)) {
    return true;
  }

  const embed = premiumUpsellEmbed(feature, tier, FEATURE_TIERS[feature], language);

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ embeds: [embed], ephemeral: true });
  } else {
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  return false;
}
