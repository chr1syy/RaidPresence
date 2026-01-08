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
import setupCommand from './commands/setup';
client.commands.set(raidCommand.data.name, raidCommand);
client.commands.set(configCommand.data.name, configCommand);
client.commands.set(setupCommand.data.name, setupCommand);

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
      raidLeaderRoles: process.env.RAID_LEADER_ROLES || '',
    },
  });

  // Send welcome/setup message
  try {
    const { EmbedBuilder, Colors } = await import('discord.js');

    const welcomeEmbed = new EmbedBuilder()
      .setTitle('🎉 Thanks for adding RaidPresence!')
      .setColor(Colors.Green)
      .setDescription(
        'I help manage WoW raid attendance with a **reverse sign-up system** - everyone is automatically signed up and must opt-out if they can\'t attend.\n\n' +
        '**Quick Setup Required:**'
      )
      .addFields(
        {
          name: '1️⃣ Configure Raid Attendance Roles',
          value: 'Run: `/config raid-roles roles:Raider,Member,Trial`\n' +
                 'Members with these roles will be automatically added to raid rosters.',
          inline: false,
        },
        {
          name: '2️⃣ Configure Raid Leader Roles',
          value: 'Run: `/config leader-roles roles:Officer,Raid Leader`\n' +
                 'Members with these roles can create and manage raids.',
          inline: false,
        },
        {
          name: '3️⃣ Create Your First Raid',
          value: 'Run: `/raid create date:2026-01-15 time:20:00 title:Heroic Raid Night`',
          inline: false,
        }
      )
      .addFields(
        {
          name: '📋 Useful Commands',
          value: '• `/config view` - View current settings\n' +
                 '• `/raid list` - List upcoming raids\n' +
                 '• `/raid delete` - Delete a raid',
          inline: false,
        }
      )
      .setFooter({ text: 'Need help? Check out the documentation or contact support' })
      .setTimestamp();

    // Try to send to system channel first, then owner
    let messageSent = false;

    if (guild.systemChannel && guild.systemChannel.permissionsFor(guild.members.me!)?.has('SendMessages')) {
      await guild.systemChannel.send({ embeds: [welcomeEmbed] });
      messageSent = true;
      console.log(`📨 Sent welcome message to system channel in ${guild.name}`);
    }

    // If no system channel or couldn't send, DM the owner
    if (!messageSent) {
      try {
        const owner = await guild.fetchOwner();
        await owner.send({ embeds: [welcomeEmbed] });
        console.log(`📨 Sent welcome DM to owner of ${guild.name}`);
      } catch (error) {
        console.log(`❌ Could not send welcome message to ${guild.name}`);
      }
    }
  } catch (error) {
    console.error('Error sending welcome message:', error);
  }
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
