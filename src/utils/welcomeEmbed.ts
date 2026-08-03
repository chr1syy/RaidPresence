import { EmbedBuilder, Colors } from 'discord.js';
import { getTimezoneName } from './timezoneHelper';
import { exampleRaidDate } from './exampleDate';
import { t } from './localization';
import { TRIAL_DAYS } from '../services/entitlementService';
import { VERSION } from './version';

export interface WelcomeEmbedParams {
  /** Timezone auto-detected from the guild locale, or null if detection failed. */
  detectedTimezone: number | null;
  /** Effective timezone offset applied to the guild (defaults to UTC/0). */
  timezoneOffset: number;
  /** Whether a Premium trial was just granted — surfaces the trial callout. */
  trialGranted: boolean;
  /** Resolved bot language for this guild (derived from its Discord locale). */
  language: string;
}

/**
 * Builds the welcome/setup embed shown when the bot joins a new guild.
 *
 * Kept as a pure, side-effect-free builder so it can be unit-tested and reused.
 * The trial callout is localized via `language` (the detected guild locale) so a
 * German server sees German copy instead of a hardcoded English string.
 */
export function buildWelcomeEmbed(params: WelcomeEmbedParams): EmbedBuilder {
  const { detectedTimezone, timezoneOffset, trialGranted, language } = params;

  const timezoneNote = detectedTimezone !== null
    ? `🌍 Timezone auto-detected as **${getTimezoneName(timezoneOffset)}**`
    : '⚠️ Could not auto-detect timezone - defaulting to **UTC**';

  const timezoneInstructions = detectedTimezone !== null && timezoneOffset !== 1
    ? `\n⚠️ **If this is incorrect**, run: \`/config timezone offset:1\` for GMT+1`
    : detectedTimezone === null
    ? `\n**Please set your timezone:** \`/config timezone offset:1\` for GMT+1`
    : '';

  const welcomeEmbed = new EmbedBuilder()
    .setTitle('🎉 Thanks for adding RaidPresence!')
    .setColor(Colors.Green)
    .setDescription(
      'I help manage WoW raid attendance with a **reverse sign-up system** - everyone is automatically signed up and must opt-out if they can\'t attend.\n\n' +
      `${timezoneNote}${timezoneInstructions}\n\n` +
      '**Quick Setup Required:**'
    )
    .addFields(
      {
        name: '1️⃣ Set Timezone (if not GMT+1)',
        value: 'Run: `/config timezone offset:1` for GMT+1\n' +
               'Or: `/config timezone offset:<hours>` for your timezone\n' +
               '**This ensures raid times are created correctly!**',
        inline: false,
      },
      {
        name: '2️⃣ Raid Attendance Roles',
        value: 'These are set per raid, not in the config: `/raid create` has a required ' +
               '`roles:` option.\n' +
               'Pass role names or role IDs, comma-separated without spaces after the comma ' +
               '(e.g. `roles:Raider,Member,Trial`).\n' +
               'Members with those roles are automatically added to that raid\'s roster.',
        inline: false,
      },
      {
        name: '3️⃣ Configure Raid Leader Roles',
        value: 'Run: `/config leader-roles roles:Officer,Raid Leader`\n' +
               'Members with these roles can create and manage raids.',
        inline: false,
      },
      {
        name: '4️⃣ Create Your First Raid',
        value: `Run: \`/raid create date:${exampleRaidDate()} time:20:00 title:Heroic Raid Night roles:Raider,Member,Trial\``,
        inline: false,
      }
    )
    .addFields(
      {
        name: '📋 Useful Commands',
        value: '• `/config view` - View current settings\n' +
               '• `/raid list` - List upcoming raids\n' +
               '• `/raid delete` - Delete a raid\n' +
               '• `/team list` - Run several raid teams side by side (mains, alts, second group)',
        inline: false,
      }
    )
    .setFooter({ text: `Need help? Check out the documentation or contact support | v${VERSION}` })
    .setTimestamp();

  // Highlight the auto-granted Premium trial for brand-new servers, localized to
  // the detected guild locale.
  if (trialGranted) {
    welcomeEmbed.addFields({
      name: `🎁 ${TRIAL_DAYS}-Day Premium Trial`,
      value: t(language, 'premiumTrialGranted', {
        days: String(TRIAL_DAYS),
        tier: t(language, 'premiumTierPremium'),
      }) +
             `\n${t(language, 'premiumTrialTeamsHint')}`,
      inline: false,
    });
  }

  return welcomeEmbed;
}
