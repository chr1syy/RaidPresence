import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getTranslations } from './localization';

/**
 * The interactive buttons under an open raid embed.
 *
 * Every place that posts or re-posts a raid message needs exactly these four buttons
 * with exactly these custom IDs — `/raid create`, the guided flow, clone, edit, reopen,
 * unarchive, and now the recurring/nudge follow-ups. They were copy-pasted five times;
 * a fifth copy in the recurrence path is how custom IDs drift apart.
 *
 * Two rows because Discord allows at most five buttons per row and the class picker is
 * a different kind of action than the three attendance answers.
 *
 * @param raidId Raid the buttons act on — embedded in each custom ID
 * @param language Guild language for the labels
 */
export function buildRaidButtonRows(
  raidId: string,
  language: string,
): ActionRowBuilder<ButtonBuilder>[] {
  const trans = getTranslations(language || 'en');

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`raid_optin_${raidId}`)
      .setLabel(trans.optIn)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`raid_late_${raidId}`)
      .setLabel(trans.runningLateButton)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`raid_optout_${raidId}`)
      .setLabel(trans.optOut)
      .setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`raid_class_${raidId}`)
      .setLabel(trans.setClassSpec)
      .setStyle(ButtonStyle.Primary),
  );

  return [row1, row2];
}
