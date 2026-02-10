import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import raidCommand from './commands/raid';
import configCommand from './commands/config';
import setupCommand from './commands/setup';

config();

const commands = [
  raidCommand.data.toJSON(),
  configCommand.data.toJSON(),
  setupCommand.data.toJSON(),
];

const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

async function deployCommands() {
  try {
    const guildId = process.argv[2];
    
    if (guildId) {
      // Deploy to specific guild (instant)
      console.log(`🔄 Started refreshing ${commands.length} application (/) commands to guild ${guildId}.`);
      
      const data = await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID!, guildId),
        { body: commands }
      ) as any[];
      
      console.log(`✅ Successfully reloaded ${data.length} application (/) commands in guild.`);
    } else {
      // Deploy globally (takes 5-10 minutes)
      console.log(`🔄 Started refreshing ${commands.length} application (/) commands globally.`);
      
      const data = await rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
        { body: commands }
      ) as any[];
      
      console.log(`✅ Successfully reloaded ${data.length} application (/) commands globally.`);
      console.log(`⏱️  Commands may take 5-10 minutes to appear in Discord.`);
    }
  } catch (error) {
    console.error('❌ Error deploying commands:', error);
  }
}

deployCommands();
