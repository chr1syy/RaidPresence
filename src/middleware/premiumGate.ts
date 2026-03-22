import { ChatInputCommandInteraction, ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import { getTier, hasFeature, FEATURE_TIERS, PremiumFeature, PremiumTier } from '../services/entitlementService';
import { t } from '../utils/localization';

const TIER_NAME_KEYS: Record<PremiumTier, 'premiumTierFree' | 'premiumTierPremium' | 'premiumTierPro'> = {
  FREE: 'premiumTierFree',
  PREMIUM: 'premiumTierPremium',
  PRO: 'premiumTierPro',
};

const FEATURE_DISPLAY_NAMES: Record<PremiumFeature, string> = {
  'raid.notes': 'Raid Notes',
  'raid.archive': 'Raid Archive',
  'raid.recurring': 'Recurring Raids',
  'raid.template': 'Raid Templates',
  'raid.integrations': 'Raid Integrations',
  'stats.full_history': 'Full Statistics History',
  'stats.export': 'Statistics Export',
};

/**
 * Checks if a guild has access to a premium feature.
 * If blocked, sends an ephemeral upsell reply and returns false.
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

  const requiredTier = FEATURE_TIERS[feature];
  const tierName = t(language, TIER_NAME_KEYS[requiredTier]);
  const featureName = FEATURE_DISPLAY_NAMES[feature];

  const message = t(language, 'premiumUpsell', { tier: tierName, feature: featureName });

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content: message, ephemeral: true });
  } else {
    await interaction.reply({ content: message, ephemeral: true });
  }

  return false;
}
