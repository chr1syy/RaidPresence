import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = '778538828758908928';

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function clearCommands() {
  try {
    console.log(`🔄 Clearing commands from guild ${GUILD_ID}...`);
    
    const result = await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: [] }
    );
    
    console.log(`✅ Successfully cleared all commands from guild`);
    console.log(`📊 Result:`, result);
  } catch (error) {
    console.error('❌ Error clearing commands:', error);
    process.exit(1);
  }
}

clearCommands();
