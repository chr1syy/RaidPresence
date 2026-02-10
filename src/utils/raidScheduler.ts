import { Client } from 'discord.js';
import prisma from '../database/client';
import { createRaidEmbed } from '../commands/raid';
import { archiveRaid } from './archiveManager';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getTranslations } from './localization';
import { autoPurgeAllGuilds } from './raidPurger';

export function startRaidScheduler(client: Client) {
  // Check every 2 minutes for expired raids
  const CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes in milliseconds
  let lastPurgeTime = 0; // Timestamp of last auto-purge

  setInterval(async () => {
    try {
      await checkAndCloseExpiredRaids(client);
      
      // Run auto-purge daily (every 24 hours)
      const now = Date.now();
      if (now - lastPurgeTime > 24 * 60 * 60 * 1000) { // 24 hours
        await autoPurgeAllGuilds();
        lastPurgeTime = now;
      }
    } catch (error) {
      console.error('Error in raid scheduler:', error);
    }
  }, CHECK_INTERVAL);

  console.log('✅ Raid scheduler started - checking for expired raids every 2 minutes');
  console.log('✅ Auto-purge enabled - running daily cleanup of old raids');
}

async function postFeedbackMessage(raid: any, client: Client) {
  if (!raid.channelId) return;

  const channel = await client.channels.fetch(raid.channelId);
  if (!channel?.isTextBased() || !('send' in channel)) return;

  const trans = getTranslations(raid.guild.language || 'en');

  const embed = new EmbedBuilder()
    .setTitle(trans.raidFeedback)
    .setDescription(trans.howDidRaidGo)
    .setColor(0xffa500);

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`feedback_great_${raid.id}`)
      .setEmoji('😊')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`feedback_okay_${raid.id}`)
      .setEmoji('😐')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`feedback_bad_${raid.id}`)
      .setEmoji('😞')
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({
    embeds: [embed],
    components: [buttons],
  });
}

export async function checkAndCloseExpiredRaids(client: Client) {
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

         // Check if auto-archive is enabled for this guild
         const shouldAutoArchive = !!(raid.guild.autoArchive && raid.guild.archiveChannelId);
         let archivedSuccessfully = false;

        // If auto-archive is enabled, archive the raid
        if (shouldAutoArchive) {
          try {
            await archiveRaid(raid.id, raid.guildId, client);
            archivedSuccessfully = true;
            console.log(`✅ Auto-archived raid: ${raid.description} (${raid.id})`);
          } catch (archiveError) {
            console.error(`⚠️ Failed to auto-archive raid ${raid.id}:`, archiveError);
            // Continue with regular closure even if archiving fails
          }
        }

        // Update the raid message if it exists (for non-archived raids or if archiving failed)
        if (!archivedSuccessfully && raid.messageId && raid.channelId) {
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

              await postFeedbackMessage(raid, client);

              console.log(`✅ Auto-closed raid: ${raid.description} (${raid.id})`);
            }
          } catch (error) {
            console.error(`Error updating message for raid ${raid.id}:`, error);
          }
        } else if (archivedSuccessfully) {
          console.log(`✅ Auto-closed and archived raid: ${raid.description} (${raid.id})`);
        } else if (raid.messageId && raid.channelId) {
          // This case handles when shouldAutoArchive was false but we didn't have message to update
          console.log(`✅ Auto-closed raid (no message update needed): ${raid.description} (${raid.id})`);
        }
     } catch (error) {
       console.error(`Error closing raid ${raid.id}:`, error);
     }
   }
}
