import { EmbedBuilder } from 'discord.js';
import { getTranslations } from './localization';

export interface RaidNoteEntry {
  username: string;
  playerNote?: string;
  optoutReason?: string;
  status: string;
  notedAt?: Date;
}

/**
 * Format a raid notes embed showing all player notes and opt-out reasons.
 *
 * @param raidName - The name/title of the raid
 * @param raidDate - The date of the raid
 * @param notes - Array of note entries from attendance records
 * @param language - Language code ('en' or 'de')
 * @returns EmbedBuilder ready to send
 */
export function formatRaidNotesEmbed(
  raidName: string,
  raidDate: Date,
  notes: RaidNoteEntry[],
  language: string,
): EmbedBuilder {
  const trans = getTranslations(language);

  // Separate player notes and opt-out reasons
  const playerNotes = notes.filter((n) => n.playerNote && n.playerNote.trim());
  const optoutReasons = notes.filter((n) => n.optoutReason && n.optoutReason.trim());

  const raidDateStr = raidDate.toISOString().split('T')[0];

  const embed = new EmbedBuilder()
    .setTitle(`📝 ${trans.raidNotes}: ${raidName}`)
    .setColor(0x5865f2) // Discord blurple
    .setDescription(`**${raidDateStr}**`)
    .setTimestamp();

  // Add player notes section
  if (playerNotes.length > 0) {
    const notesText = playerNotes
      .map((n) => `**${n.username}:** ${n.playerNote}`)
      .join('\n');

    embed.addFields({
      name: `💬 ${trans.raidNotesPlayerComments} (${playerNotes.length})`,
      value: notesText || trans.raidNotesNone,
      inline: false,
    });
  }

  // Add opt-out reasons section
  if (optoutReasons.length > 0) {
    const reasonsText = optoutReasons
      .map((n) => `**${n.username}:** ${n.optoutReason}`)
      .join('\n');

    embed.addFields({
      name: `❌ ${trans.raidNotesOptoutReasons} (${optoutReasons.length})`,
      value: reasonsText || trans.raidNotesNone,
      inline: false,
    });
  }

  // If no notes at all
  if (playerNotes.length === 0 && optoutReasons.length === 0) {
    embed.setDescription(
      `**${raidDateStr}**\n\n${trans.raidNotesNone}`,
    );
  }

  return embed;
}

