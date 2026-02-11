/**
 * Unit tests for permissions utility functions
 */

import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { canManageRaids } from '../permissions';

// Mock dependencies
jest.mock('../../database/client', () => ({
  __esModule: true,
  default: {
    guild: {
      findUnique: jest.fn(),
    },
  },
}));

import prisma from '../../database/client';

const mockPrisma = prisma as any;

// Mock GuildMember
const createMockMember = (options: {
  admin?: boolean;
  manageEvents?: boolean;
  roles?: string[];
  roleNames?: string[];
  guildId?: string;
}): GuildMember => {
  const member = {
    permissions: {
      has: jest.fn((perm) => {
        if (perm === PermissionFlagsBits.Administrator) return options.admin || false;
        if (perm === PermissionFlagsBits.ManageEvents) return options.manageEvents || false;
        return false;
      }),
    },
    roles: {
      cache: {
        some: jest.fn((fn) => {
          const roles = (options.roles || []).map((roleId, index) => ({
            id: roleId,
            name: options.roleNames?.[index] || `Role ${index}`,
          }));
          return roles.some(fn);
        }),
      },
    },
    guild: { id: options.guildId || 'guild-1' },
  } as any;
  return member;
};

describe('permissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('canManageRaids', () => {
    it('should return true for administrators', async () => {
      const member = createMockMember({ admin: true });

      const result = await canManageRaids(member);

      expect(result).toBe(true);
      expect(mockPrisma.guild.findUnique).not.toHaveBeenCalled();
    });

    it('should return true for ManageEvents when no guild data', async () => {
      const member = createMockMember({ manageEvents: true });
      mockPrisma.guild.findUnique.mockResolvedValue(null);

      const result = await canManageRaids(member);

      expect(result).toBe(true);
      expect(member.permissions.has).toHaveBeenCalledWith(PermissionFlagsBits.ManageEvents);
    });

    it('should return false for no ManageEvents when no guild data', async () => {
      const member = createMockMember({ manageEvents: false });
      mockPrisma.guild.findUnique.mockResolvedValue(null);

      const result = await canManageRaids(member);

      expect(result).toBe(false);
    });

    it('should return true for ManageEvents when guild has no leader roles', async () => {
      const member = createMockMember({ manageEvents: true });
      mockPrisma.guild.findUnique.mockResolvedValue({
        raidLeaderRoles: '',
      });

      const result = await canManageRaids(member);

      expect(result).toBe(true);
    });

    it('should return false for no ManageEvents when guild has no leader roles', async () => {
      const member = createMockMember({ manageEvents: false });
      mockPrisma.guild.findUnique.mockResolvedValue({
        raidLeaderRoles: '',
      });

      const result = await canManageRaids(member);

      expect(result).toBe(false);
    });

    it('should return true when member has leader role by id', async () => {
      const member = createMockMember({ roles: ['role-1', 'role-2'] });
      mockPrisma.guild.findUnique.mockResolvedValue({
        raidLeaderRoles: 'role-1, role-3',
      });

      const result = await canManageRaids(member);

      expect(result).toBe(true);
    });

    it('should return true when member has leader role by name', async () => {
      const member = createMockMember({ roles: ['role-1'], roleNames: ['Leader'] });
      mockPrisma.guild.findUnique.mockResolvedValue({
        raidLeaderRoles: 'Admin, Leader',
      });

      const result = await canManageRaids(member);

      expect(result).toBe(true);
    });

    it('should return false when member does not have leader role', async () => {
      const member = createMockMember({ roles: ['role-1'] });
      mockPrisma.guild.findUnique.mockResolvedValue({
        raidLeaderRoles: 'role-2, role-3',
      });

      const result = await canManageRaids(member);

      expect(result).toBe(false);
    });
  });
});