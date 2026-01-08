import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import { config } from 'dotenv';
import { BotClient, Command } from './types';
import prisma from './database/client';

config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
}) as BotClient;

client.commands = new Collection<string, Command>();

// Import commands dynamically
import raidCommand from './commands/raid';
import configCommand from './commands/config';
client.commands.set(raidCommand.data.name, raidCommand);
client.commands.set(configCommand.data.name, configCommand);

// Ready event
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot is ready! Logged in as ${c.user.tag}`);
  console.log(`📊 Serving ${c.guilds.cache.size} guild(s)`);

  // Sync guild data
  for (const [guildId, guild] of c.guilds.cache) {
    await prisma.guild.upsert({
      where: { id: guildId },
      update: { name: guild.name },
      create: {
        id: guildId,
        name: guild.name,
        raidRoles: process.env.RAID_ROLES || '',
        raidLeaderRoles: process.env.RAID_LEADER_ROLES || '',
      },
    });
  }

  console.log('✅ Guild data synchronized');
});

// Interaction handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`Command ${interaction.commandName} not found`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error('Error executing command:', error);

      const errorMessage = {
        content: '❌ There was an error executing this command!',
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  } else if (interaction.isButton()) {
    // Import button handler
    const buttonHandler = await import('./events/buttonHandler');
    await buttonHandler.handleButton(interaction);
  } else if (interaction.isStringSelectMenu()) {
    // Import select menu handler
    const selectHandler = await import('./events/selectHandler');
    await selectHandler.handleSelectMenu(interaction);
  }
});

// Guild join event
client.on(Events.GuildCreate, async (guild) => {
  console.log(`➕ Joined new guild: ${guild.name} (${guild.id})`);

  await prisma.guild.create({
    data: {
      id: guild.id,
      name: guild.name,
      raidRoles: process.env.RAID_ROLES || '',
    },
  });
});

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
});

// Login
client.login(process.env.DISCORD_TOKEN);
