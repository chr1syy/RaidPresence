import prisma from '../database/client';

/**
 * Purges old raids for all guilds that have auto-purge enabled
 * Called daily by the raid scheduler
 */
export async function autoPurgeAllGuilds() {
  console.log('🗑️ Running auto-purge for all guilds...');

  const guilds = await prisma.guild.findMany({
    where: {
      autoPurgeEnabled: true,
    },
  });

  let totalDeleted = 0;

  for (const guild of guilds) {
    try {
      const deleted = await purgeOldRaids(guild.id, guild.autoPurgeDays);
      if (deleted > 0) {
        console.log(`🗑️ Auto-purged ${deleted} old raids for guild ${guild.name} (${guild.id})`);
        totalDeleted += deleted;
      }
    } catch (error) {
      console.error(`Error auto-purging raids for guild ${guild.id}:`, error);
    }
  }

  if (totalDeleted > 0) {
    console.log(`✅ Auto-purge completed: deleted ${totalDeleted} old raids total`);
  } else {
    console.log('✅ Auto-purge completed: no old raids to delete');
  }
}

/**
 * Purges old raids for a specific guild
 * @param guildId The guild ID
 * @param days Number of days old raids must be to be deleted
 * @returns Number of raids deleted
 */
export async function purgeOldRaids(guildId: string, days: number): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Find raids that are closed or cancelled, older than cutoff, and not pinned
  const oldRaids = await prisma.raid.findMany({
    where: {
      guildId,
      status: { in: ['closed', 'cancelled'] },
      raidDate: { lt: cutoffDate },
      isPinned: false, // Don't delete pinned/archived raids
    },
    select: {
      id: true,
      description: true,
      raidDate: true,
    },
  });

  if (oldRaids.length === 0) {
    return 0;
  }

  // Log what we're deleting
  console.log(`Deleting ${oldRaids.length} old raids for guild ${guildId}:`);
  oldRaids.forEach(raid => {
    console.log(`  - ${raid.description} (${raid.id}) from ${raid.raidDate.toISOString().split('T')[0]}`);
  });

  // Delete the raids (cascade will handle attendance and feedback)
  const deleteResult = await prisma.raid.deleteMany({
    where: {
      id: { in: oldRaids.map(r => r.id) },
    },
  });

  return deleteResult.count;
}

/**
 * Manually purge raids for a guild (admin command)
 * @param guildId The guild ID
 * @param days Number of days
 * @param dryRun If true, just return what would be deleted without deleting
 * @returns Object with deleted count and list of raids
 */
export async function manualPurgeRaids(guildId: string, days: number, dryRun = false) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const oldRaids = await prisma.raid.findMany({
    where: {
      guildId,
      status: { in: ['closed', 'cancelled'] },
      raidDate: { lt: cutoffDate },
      isPinned: false,
    },
    select: {
      id: true,
      description: true,
      raidDate: true,
      status: true,
    },
    orderBy: { raidDate: 'asc' },
  });

  if (dryRun) {
    return {
      count: oldRaids.length,
      raids: oldRaids,
      deleted: false,
    };
  }

  if (oldRaids.length === 0) {
    return {
      count: 0,
      raids: [],
      deleted: true,
    };
  }

  const deleteResult = await prisma.raid.deleteMany({
    where: {
      id: { in: oldRaids.map(r => r.id) },
    },
  });

  return {
    count: deleteResult.count,
    raids: oldRaids,
    deleted: true,
  };
}