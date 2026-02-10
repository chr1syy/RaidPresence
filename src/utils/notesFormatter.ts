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
 * Discord embed field character limit (per field).
 */
const DISCORD_FIELD_CHAR_LIMIT = 1024;

/**
 * Discord embed field count limit (per embed).
 */
const DISCORD_FIELD_LIMIT = 25;

/**
 * Discord embed total character limit (per embed).
 */
const DISCORD_EMBED_TOTAL_CHAR_LIMIT = 6000;

/**
 * Truncate field content to Discord's 1024 character limit, adding indicator if truncated.
 *
 * @param text - The text to truncate
 * @param maxLength - Maximum length allowed (defaults to DISCORD_FIELD_CHAR_LIMIT)
 * @returns Truncated text with "...and N more" indicator if needed
 */
function truncateFieldContent(text: string, itemCount: number, maxLength: number = DISCORD_FIELD_CHAR_LIMIT): { content: string; wasTruncated: boolean } {
  if (text.length <= maxLength) {
    return { content: text, wasTruncated: false };
  }

  // Reserve space for "...and X more" message
  const truncationMsg = `\n\n...and ${itemCount} more notes not shown`;
  const availableSpace = maxLength - truncationMsg.length;

  if (availableSpace <= 0) {
    // Fallback: just show truncation without count
    return { 
      content: text.substring(0, maxLength - 4) + '...', 
      wasTruncated: true 
    };
  }

  const truncatedText = text.substring(0, availableSpace);
  return { 
    content: truncatedText + truncationMsg, 
    wasTruncated: true 
  };
}

/**
 * Format a raid notes embed showing all player notes and opt-out reasons.
 * Handles Discord's embed field character limits (1024 chars per field, 25 fields per embed).
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

    const { content, wasTruncated } = truncateFieldContent(notesText, playerNotes.length);
    const fieldName = wasTruncated 
      ? `💬 ${trans.raidNotesPlayerComments} (${playerNotes.length}, truncated)`
      : `💬 ${trans.raidNotesPlayerComments} (${playerNotes.length})`;

    embed.addFields({
      name: fieldName,
      value: content || trans.raidNotesNone,
      inline: false,
    });
  }

  // Add opt-out reasons section
  if (optoutReasons.length > 0) {
    const reasonsText = optoutReasons
      .map((n) => `**${n.username}:** ${n.optoutReason}`)
      .join('\n');

    const { content, wasTruncated } = truncateFieldContent(reasonsText, optoutReasons.length);
    const fieldName = wasTruncated 
      ? `❌ ${trans.raidNotesOptoutReasons} (${optoutReasons.length}, truncated)`
      : `❌ ${trans.raidNotesOptoutReasons} (${optoutReasons.length})`;

    embed.addFields({
      name: fieldName,
      value: content || trans.raidNotesNone,
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

