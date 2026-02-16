import { EmbedBuilder } from 'discord.js';
import { getTranslations } from './localization';
import { VERSION } from './version';

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
function truncateFieldContent(text: string, itemCount: number, maxLength: number = DISCORD_FIELD_CHAR_LIMIT): { content: string; wasTruncated: boolean; omittedCount: number } {
  if (text.length <= maxLength) {
    return { content: text, wasTruncated: false, omittedCount: 0 };
  }

  // Count how many items are actually included by counting newlines
  // Each item is a line starting with "**username:**"
  const lines = text.split('\n');
  const displayedCount = lines.filter(line => line.includes('**')).length;
  const omittedCount = Math.max(0, itemCount - displayedCount);

  // Reserve space for "...and X more notes" message
  const truncationMsg = omittedCount > 0 
    ? `\n\n...and ${omittedCount} more notes not shown`
    : '\n\n(truncated)';
  const availableSpace = maxLength - truncationMsg.length;

  if (availableSpace <= 0) {
    // Fallback: just show truncation without count
    return { 
      content: text.substring(0, maxLength - 4) + '...', 
      wasTruncated: true,
      omittedCount
    };
  }

  const truncatedText = text.substring(0, availableSpace);
  return { 
    content: truncatedText + truncationMsg, 
    wasTruncated: true,
    omittedCount
  };
}

/**
 * Format a raid notes embed showing all player notes and opt-out reasons.
 * Handles Discord's embed field character limits (1024 chars per field, 25 fields per embed).
 * Enforces embed limits to prevent silent failures at Discord API.
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

  // Track embed limits
  let currentFieldCount = 1; // Title already counts as 1
  let totalEmbedCharacters = 
    trans.raidNotes.length + 
    raidName.length + 
    raidDateStr.length + 
    10; // Title + description

  // Add player notes section if not empty and within limits
  if (playerNotes.length > 0 && currentFieldCount < DISCORD_FIELD_LIMIT) {
    const notesText = playerNotes
      .map((n) => `**${n.username}:** ${n.playerNote}`)
      .join('\n');

    const { content, wasTruncated, omittedCount } = truncateFieldContent(notesText, playerNotes.length);
    const fieldName = wasTruncated 
      ? `💬 ${trans.raidNotesPlayerComments} (${playerNotes.length - omittedCount} of ${playerNotes.length})`
      : `💬 ${trans.raidNotesPlayerComments} (${playerNotes.length})`;

    // Check if adding this field would exceed limits
    const fieldSize = fieldName.length + content.length;
    if (totalEmbedCharacters + fieldSize <= DISCORD_EMBED_TOTAL_CHAR_LIMIT) {
      embed.addFields({
        name: fieldName,
        value: content || trans.raidNotesNone,
        inline: false,
      });
      currentFieldCount++;
      totalEmbedCharacters += fieldSize;
    } else {
      // Log when limit is hit
      console.warn(`[notesFormatter] Player notes field exceeded embed character limit. Total would be ${totalEmbedCharacters + fieldSize}/${DISCORD_EMBED_TOTAL_CHAR_LIMIT}`);
    }
  }

  // Add opt-out reasons section if not empty and within limits
  if (optoutReasons.length > 0 && currentFieldCount < DISCORD_FIELD_LIMIT) {
    const reasonsText = optoutReasons
      .map((n) => `**${n.username}:** ${n.optoutReason}`)
      .join('\n');

    const { content, wasTruncated, omittedCount } = truncateFieldContent(reasonsText, optoutReasons.length);
    const fieldName = wasTruncated 
      ? `❌ ${trans.raidNotesOptoutReasons} (${optoutReasons.length - omittedCount} of ${optoutReasons.length})`
      : `❌ ${trans.raidNotesOptoutReasons} (${optoutReasons.length})`;

    // Check if adding this field would exceed limits
    const fieldSize = fieldName.length + content.length;
    if (totalEmbedCharacters + fieldSize <= DISCORD_EMBED_TOTAL_CHAR_LIMIT) {
      embed.addFields({
        name: fieldName,
        value: content || trans.raidNotesNone,
        inline: false,
      });
      currentFieldCount++;
      totalEmbedCharacters += fieldSize;
    } else {
      // Log when limit is hit
      console.warn(`[notesFormatter] Opt-out reasons field exceeded embed character limit. Total would be ${totalEmbedCharacters + fieldSize}/${DISCORD_EMBED_TOTAL_CHAR_LIMIT}`);
    }
  }

  // If no notes at all
  if (playerNotes.length === 0 && optoutReasons.length === 0) {
    embed.setDescription(
      `**${raidDateStr}**\n\n${trans.raidNotesNone}`,
    );
  }

  // Log if we hit field count limit
  if (currentFieldCount >= DISCORD_FIELD_LIMIT) {
    console.warn(`[notesFormatter] Field count limit reached (${DISCORD_FIELD_LIMIT}). Some fields may not be displayed.`);
  }

  embed.addFields({ name: 'Links', value: '[Web](https://raidpresence.dev)', inline: true });

  embed.setFooter({ text: `v${VERSION}` });

  return embed;
}

