import { ChatInputCommandInteraction, GatewayRateLimitError } from 'discord.js';
import { getTranslations } from './localization';

/**
 * Check if an error is a Discord rate limit error
 * @param error The error to check
 * @returns true if the error is a rate limit error
 */
export function isRateLimitError(error: any): error is GatewayRateLimitError {
  return error?.name === 'GatewayRateLimitError' || error?.data?.retry_after !== undefined;
}

/**
 * Handle rate limit errors and send a user-friendly message
 * @param error The error to handle
 * @param interaction The Discord interaction
 * @param guildLanguage The guild's language setting
 */
export async function handleRateLimitError(
  error: any,
  interaction: ChatInputCommandInteraction,
  guildLanguage: string = 'en'
): Promise<void> {
  if (!isRateLimitError(error)) {
    throw error; // Not a rate limit error, re-throw
  }

  const trans = getTranslations(guildLanguage);
  const retryAfter = Math.ceil((error.data?.retry_after || 5) * 1000); // Convert to ms and round up
  const retrySeconds = Math.ceil(retryAfter / 1000);

  const rateLimitMessage =
    guildLanguage === 'de'
      ? `⏱️ Discord hat uns vorübergehend gedrosselt. Bitte versuchen Sie es in ${retrySeconds} Sekunden erneut.`
      : `⏱️ Discord has rate-limited us. Please try again in ${retrySeconds} seconds.`;

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: rateLimitMessage,
      });
    } else {
      await interaction.reply({
        content: rateLimitMessage,
        ephemeral: true,
      });
    }
  } catch (replyError) {
    console.error('[handleRateLimitError] Failed to send rate limit message:', replyError);
  }
}

/**
 * Fetch guild members with rate limit error handling
 * @param interaction The Discord interaction
 * @param guildLanguage The guild's language setting
 * @returns true if fetch succeeded, false if rate limited
 */
export async function fetchMembersWithRateLimitHandling(
  interaction: ChatInputCommandInteraction,
  guildLanguage: string = 'en'
): Promise<boolean> {
  try {
    await interaction.guild!.members.fetch();
    return true;
  } catch (error) {
    if (isRateLimitError(error)) {
      await handleRateLimitError(error, interaction, guildLanguage);
      return false;
    }
    throw error;
  }
}
