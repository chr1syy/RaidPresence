import prisma from '../database/client';

/**
 * Given the user's Discord role IDs and the raid's role IDs,
 * return the first raid role ID that the user has. Return null if no match.
 */
export function resolveUserRoleId(
  userRoleIds: string[],
  raidRoleIds: string[],
): string | null {
  for (const raidRole of raidRoleIds) {
    if (userRoleIds.includes(raidRole)) {
      return raidRole;
    }
  }
  return null;
}

/**
 * For each user, resolve their effective class/spec preference:
 * role-specific preference if available, otherwise global UserPreference fallback.
 */
export async function getEffectivePrefsMap(
  userIds: string[],
  guildId: string,
  raidRoleIds: string[],
  memberRolesMap: Map<string, string[]>,
): Promise<Map<string, { wowClass: string | null; wowSpec: string | null }>> {
  const result = new Map<
    string,
    { wowClass: string | null; wowSpec: string | null }
  >();

  if (userIds.length === 0) return result;

  // Build a map of userId -> matched roleId
  const userRoleMatches = new Map<string, string>();
  const matchedRoleIds = new Set<string>();
  for (const userId of userIds) {
    const memberRoles = memberRolesMap.get(userId) ?? [];
    const roleId = resolveUserRoleId(memberRoles, raidRoleIds);
    if (roleId) {
      userRoleMatches.set(userId, roleId);
      matchedRoleIds.add(roleId);
    }
  }

  // Batch query: role-specific preferences
  const rolePrefs =
    matchedRoleIds.size > 0
      ? await prisma.userRolePreference.findMany({
          where: {
            guildId,
            userId: { in: userIds },
            roleId: { in: [...matchedRoleIds] },
          },
        })
      : [];

  // Index role prefs by `userId:roleId`
  const rolePrefMap = new Map<
    string,
    { wowClass: string | null; wowSpec: string | null }
  >();
  for (const rp of rolePrefs) {
    rolePrefMap.set(`${rp.userId}:${rp.roleId}`, {
      wowClass: rp.wowClass,
      wowSpec: rp.wowSpec,
    });
  }

  // Batch query: global fallback preferences
  const globalPrefs = await prisma.userPreference.findMany({
    where: {
      guildId,
      userId: { in: userIds },
    },
  });

  const globalPrefMap = new Map<
    string,
    { wowClass: string | null; wowSpec: string | null }
  >();
  for (const gp of globalPrefs) {
    globalPrefMap.set(gp.userId, {
      wowClass: gp.wowClass,
      wowSpec: gp.wowSpec,
    });
  }

  // Resolve each user
  for (const userId of userIds) {
    const matchedRole = userRoleMatches.get(userId);
    if (matchedRole) {
      const rolePref = rolePrefMap.get(`${userId}:${matchedRole}`);
      if (rolePref) {
        result.set(userId, rolePref);
        continue;
      }
    }
    result.set(
      userId,
      globalPrefMap.get(userId) ?? { wowClass: null, wowSpec: null },
    );
  }

  return result;
}
