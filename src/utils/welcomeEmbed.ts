import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Colors } from 'discord.js';
import { t } from './localization';
import { TRIAL_DAYS } from '../services/entitlementService';
import { VERSION } from './version';

/** Custom-ID prefixes for the two welcome buttons; handled in `events/welcomeFlow.ts`. */
export const WELCOME_BUTTON_SETUP = 'welcome-setup';
export const WELCOME_BUTTON_FIRST_RAID = 'welcome-firstraid';

export interface WelcomeEmbedParams {
  /** Whether a Premium trial was just granted — surfaces the trial callout. */
  trialGranted: boolean;
  /** Resolved bot language for this guild (derived from its Discord locale). */
  language: string;
}

/**
 * Builds the welcome message shown when the bot joins a new guild.
 *
 * Previously this was five fields and ~1500 characters of numbered setup steps and
 * command reference — a documentation page presented to someone who had not yet done
 * anything. Nobody reads four steps right after clicking "Add to server"; they look
 * for the one next click. So: one sentence of value, one line of direction, two
 * buttons, and an optional trial line (#39).
 *
 * Everything the old embed explained up front — timezone, roles, raid leaders — is
 * now asked for inside the flows, at the moment it matters.
 *
 * Kept as a pure, side-effect-free builder so it can be unit-tested and reused.
 */
export function buildWelcomeEmbed(params: WelcomeEmbedParams): EmbedBuilder {
  const { trialGranted, language } = params;

  const welcomeEmbed = new EmbedBuilder()
    .setTitle(t(language, 'welcomeTitle'))
    .setColor(Colors.Green)
    .setDescription(
      `${t(language, 'welcomeCoreBenefit')}\n\n${t(language, 'welcomeNextStep')}`
    )
    .setFooter({ text: `v${VERSION}` });

  // The only field, and only when there is something to say. The trial is worth a
  // line because it silently expires; everything else is a button away.
  if (trialGranted) {
    welcomeEmbed.addFields({
      name: t(language, 'welcomeTrialTitle', { days: TRIAL_DAYS }),
      value:
        t(language, 'premiumTrialGranted', {
          days: TRIAL_DAYS,
          tier: t(language, 'premiumTierPremium'),
        }) + `\n${t(language, 'premiumTrialTeamsHint')}`,
      inline: false,
    });
  }

  return welcomeEmbed;
}

/**
 * The two welcome buttons.
 *
 * The guild id travels in the custom ID because the welcome message is usually
 * delivered by DM, where the interaction carries no guild context at all. Without
 * it the handler could not tell the user which server to go back to.
 */
export function buildWelcomeButtons(
  guildId: string,
  language: string
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${WELCOME_BUTTON_SETUP}:${guildId}`)
      .setLabel(t(language, 'welcomeButtonSetup'))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${WELCOME_BUTTON_FIRST_RAID}:${guildId}`)
      .setLabel(t(language, 'welcomeButtonFirstRaid'))
      .setStyle(ButtonStyle.Success)
  );
}

/** Convenience: the full message payload used by every delivery path. */
export function buildWelcomeMessage(params: WelcomeEmbedParams & { guildId: string }) {
  return {
    embeds: [buildWelcomeEmbed(params)],
    components: [buildWelcomeButtons(params.guildId, params.language)],
  };
}
