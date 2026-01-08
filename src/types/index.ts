import { SlashCommandBuilder, CommandInteraction, Client, Collection } from 'discord.js';

export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: CommandInteraction) => Promise<void>;
}

export interface BotClient extends Client {
  commands: Collection<string, Command>;
}

export type AttendanceStatus = 'attending' | 'opted_out';
