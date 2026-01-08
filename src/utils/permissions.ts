import { GuildMember, PermissionFlagsBits } from 'discord.js';
import prisma from '../database/client';

/**
 * Check if a member has permission to create/manage raids
 * @param member The guild member to check
 * @returns true if the member can manage raids
 */
export async function canManageRaids(member: GuildMember): Promise<boolean> {
  // Server administrators always have permission
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  // Get guild settings
  const guildData = await prisma.guild.findUnique({
    where: { id: member.guild.id },
  });

  if (!guildData) {
    // If no guild data, fall back to ManageEvents permission
    return member.permissions.has(PermissionFlagsBits.ManageEvents);
  }

  // Check if raid leader roles are configured
  const leaderRoles = guildData.raidLeaderRoles
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  if (leaderRoles.length === 0) {
    // No specific roles configured, use ManageEvents permission
    return member.permissions.has(PermissionFlagsBits.ManageEvents);
  }

  // Check if member has any of the configured raid leader roles
  const hasLeaderRole = member.roles.cache.some((role) =>
    leaderRoles.includes(role.id) || leaderRoles.includes(role.name)
  );

  return hasLeaderRole;
}
