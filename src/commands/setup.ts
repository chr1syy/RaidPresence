import {
  SlashCommandBuilder,
  CommandInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
  PermissionFlagsBits,
} from 'discord.js';
import prisma from '../database/client';
import { Command } from '../types';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Get help setting up the bot for your server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as SlashCommandBuilder,

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await handleSetup(interaction);
  },
};

async function handleSetup(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used in a server!',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // Get current configuration
  const guildData = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  const raidRoles = guildData?.raidRoles || 'Not configured';
  const leaderRoles = guildData?.raidLeaderRoles || 'Not configured';

  const setupEmbed = new EmbedBuilder()
    .setTitle('🛠️ RaidPresence Setup Guide')
    .setColor(Colors.Blue)
    .setDescription(
      'Welcome to RaidPresence! Here\'s how to set up your server:\n\n' +
      '**What is RaidPresence?**\n' +
      'A reverse sign-up bot for WoW raids. Everyone is auto-added to raids and must opt-out if they can\'t attend.'
    )
    .addFields(
      {
        name: '📊 Current Configuration',
        value: `**Raid Roles:** \`${raidRoles}\`\n**Leader Roles:** \`${leaderRoles}\``,
        inline: false,
      },
      {
        name: '1️⃣ Set Raid Attendance Roles',
        value: '```/config raid-roles roles:Raider,Member,Trial```\n' +
               '**What it does:** Members with these roles are automatically added to all raid rosters.\n' +
               '**Example:** If you set "Raider,Trial", anyone with the Raider OR Trial role gets added.',
        inline: false,
      },
      {
        name: '2️⃣ Set Raid Leader Roles',
        value: '```/config leader-roles roles:Officer,Raid Leader```\n' +
               '**What it does:** Only members with these roles can create/delete raids.\n' +
               '**Note:** Server admins can always create raids regardless of this setting.',
        inline: false,
      },
      {
        name: '3️⃣ Create Your First Raid',
        value: '```/raid create date:2026-01-15 time:20:00 title:Heroic Night```\n' +
               '**What happens:** Bot creates a raid message with all eligible members listed as attending.',
        inline: false,
      },
      {
        name: '💡 Tips for Role Names',
        value: '• Use exact role names (case-sensitive)\n' +
               '• Or use role IDs (right-click role → Copy ID)\n' +
               '• Separate multiple roles with commas\n' +
               '• No spaces after commas!',
        inline: false,
      },
      {
        name: '📋 Other Useful Commands',
        value: '• `/config view` - Check current settings\n' +
               '• `/raid list` - View upcoming raids\n' +
               '• `/raid delete raid_id:xyz` - Delete a raid',
        inline: false,
      },
      {
        name: '❓ Need Help?',
        value: 'Players can:\n' +
               '• Click **"Opt Out"** to remove themselves from a raid\n' +
               '• Click **"Opt In"** to re-join if they opted out\n' +
               '• Click **"Set Class/Spec"** to choose their character',
        inline: false,
      }
    )
    .setFooter({ text: 'Run /config view to check your settings anytime' })
    .setTimestamp();

  await interaction.editReply({ embeds: [setupEmbed] });
}

export default command;
