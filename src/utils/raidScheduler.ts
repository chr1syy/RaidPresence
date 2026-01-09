import { Client } from 'discord.js';
import prisma from '../database/client';
import { createRaidEmbed } from '../commands/raid';

export function startRaidScheduler(client: Client) {
  // Check every 2 minutes for expired raids
  const CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes in milliseconds

  setInterval(async () => {
    try {
      await checkAndCloseExpiredRaids(client);
    } catch (error) {
      console.error('Error in raid scheduler:', error);
    }
  }, CHECK_INTERVAL);

  console.log('✅ Raid scheduler started - checking for expired raids every 2 minutes');
}

async function checkAndCloseExpiredRaids(client: Client) {
  const now = new Date();

  // Find all open raids that have expired
  const expiredRaids = await prisma.raid.findMany({
    where: {
      status: 'open',
      raidDate: {
        lt: now,
      },
    },
    include: {
      guild: true,
    },
  });

  if (expiredRaids.length === 0) return;

  console.log(`🕐 Found ${expiredRaids.length} expired raid(s) to close`);

  for (const raid of expiredRaids) {
    try {
      // Update raid status to closed
      await prisma.raid.update({
        where: { id: raid.id },
        data: { status: 'closed' },
      });

      // Update the raid message if it exists
      if (raid.messageId && raid.channelId) {
        try {
          const channel = await client.channels.fetch(raid.channelId);
          if (channel?.isTextBased() && 'messages' in channel) {
            const message = await channel.messages.fetch(raid.messageId);
            const embed = await createRaidEmbed(raid.id, raid.guild.language);

            // Remove buttons when closed
            await message.edit({
              embeds: [embed],
              components: [],
            });

            console.log(`✅ Auto-closed raid: ${raid.description} (${raid.id})`);
          }
        } catch (error) {
          console.error(`Error updating message for raid ${raid.id}:`, error);
        }
      } else {
        console.log(`✅ Auto-closed raid (no message): ${raid.description} (${raid.id})`);
      }
    } catch (error) {
      console.error(`Error closing raid ${raid.id}:`, error);
    }
  }
}
