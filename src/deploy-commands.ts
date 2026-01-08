import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import raidCommand from './commands/raid';
import configCommand from './commands/config';

config();

const commands = [
  raidCommand.data.toJSON(),
  configCommand.data.toJSON(),
];

const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

async function deployCommands() {
  try {
    console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);

    const data = await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
      { body: commands }
    ) as any[];

    console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error('❌ Error deploying commands:', error);
  }
}

deployCommands();
