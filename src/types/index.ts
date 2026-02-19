import { SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder, CommandInteraction, Client, Collection } from 'discord.js';

/**
 * Interface defining the structure for Discord slash commands.
 * 
 * Used to ensure consistent command definitions across the bot, requiring both
 * metadata (data) and execution logic (execute) for each slash command.
 * 
 * Properties:
 *   - data: SlashCommandBuilder - The command definition including name, description, and options
 *   - execute: (interaction: CommandInteraction) => Promise<void> - Function to execute when the command is invoked
 * 
 * Example:
 *   const pingCommand: Command = {
 *     data: new SlashCommandBuilder()
 *       .setName('ping')
 *       .setDescription('Replies with Pong!'),
 *     execute: async (interaction) => {
 *       await interaction.reply('Pong!');
 *     }
 *   };
 */
export interface Command {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: CommandInteraction) => Promise<void>;
}

export interface BotClient extends Client {
  commands: Collection<string, Command>;
}

export type AttendanceStatus = 'attending' | 'opted_out';
