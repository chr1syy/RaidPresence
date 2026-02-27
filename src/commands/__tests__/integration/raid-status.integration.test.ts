/**
 * Integration Tests for /raid status command
 *
 * Tests the full pipeline: Command handler → statusFormatter → embed
 *
 * Only Prisma is mocked; status functions run against realistic data.
 */

import { canManageRaids } from '../../../utils/permissions';

jest.mock('../../../database/client');
jest.mock('../../../utils/permissions');

import prisma from '../../../database/client';
import command from '../../raid';

// ─── Helpers ──────────────────────────────────────────────────────

const guildData = {
  id: 'guild-status-int',
  name: 'Status Guild',
  language: 'en',
  timezoneOffset: 0,
  raidLeaderRoles: 'role-leader',
  raidRoles: 'role-raider',
};

/**
 * Build a mock interaction targeting the status subcommand.
 */
function buildStatusInteraction(extras: Record<string, any> = {}) {
  return {
    isChatInputCommand: jest.fn().mockReturnValue(true),
    guild: { id: 'guild-status-int', name: 'Status Guild' },
    channel: { id: 'channel-status' },
    member: {
      user: { bot: false, id: 'user-leader' },
      roles: { cache: new Map() },
    },
    user: { id: 'user-leader' },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    options: {
      getSubcommand: jest.fn().mockReturnValue('status'),
    },
    ...extras,
  } as any;
}

/**
 * Build a mock raid object with attendance included.
 */
function makeRaid(overrides: {
  id: string;
  description?: string;
  raidDate?: Date;
  guildId?: string;
  attendance?: Array<{
    userId: string;
    username: string;
    status: string;
    wowClass: string | null;
    wowSpec: string | null;
  }>;
}) {
  const raidDate = overrides.raidDate ?? new Date();
  const guildId = overrides.guildId ?? 'guild-status-int';
  const attendance = overrides.attendance ?? [];

  return {
    id: overrides.id,
    description: overrides.description ?? `Raid ${overrides.id}`,
    raidDate,
    guildId,
    guild: {
      id: guildId,
      language: 'en',
      timezoneOffset: 0,
    },
    createdAt: new Date(raidDate.getTime() - 86400000),
    closedAt: null,
    archivedAt: null,
    archiveChannelId: null,
    archiveMessageId: null,
    isPinned: false,
    attendance,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────

describe('Integration: /raid status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (canManageRaids as jest.Mock).mockResolvedValue(true);
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ ...guildData });
  });

  // ═══════════════════════════════════════════════════════════════
  // Scenario 1: Status with mixed melee/ranged DPS
  // ═══════════════════════════════════════════════════════════════
  describe('Scenario 1: Mixed melee/ranged DPS composition', () => {
    it('should display melee and ranged DPS separately in status dashboard', async () => {
      const raids = [
        makeRaid({
          id: 'r-mixed-1',
          description: 'Mixed DPS Raid',
          raidDate: new Date(Date.now() + 86400000), // Tomorrow
          attendance: [
            { userId: 'u1', username: 'Tank1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' },
            { userId: 'u2', username: 'Healer1', status: 'attending', wowClass: 'Priest', wowSpec: 'Holy' },
            { userId: 'u3', username: 'Melee1', status: 'attending', wowClass: 'Rogue', wowSpec: 'Assassination' },
            { userId: 'u4', username: 'Ranged1', status: 'attending', wowClass: 'Mage', wowSpec: 'Fire' },
            { userId: 'u5', username: 'Melee2', status: 'attending', wowClass: 'Warrior', wowSpec: 'Arms' },
            { userId: 'u6', username: 'OptedOut', status: 'opted_out', wowClass: 'Hunter', wowSpec: 'Marksmanship' },
          ],
        }),
      ];

      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      const interaction = buildStatusInteraction();
      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      const desc = embed.data.description;

      // Should contain separated DPS counts
      expect(desc).toContain('⚔️ Melee DPS: 2');
      expect(desc).toContain('🏹 Ranged DPS: 1');
      expect(desc).toContain('🛡️ 1');
      expect(desc).toContain('💚 1');
      // 5 attending + 1 opted out = 5/6 ≈83% => FULL
      expect(desc).toContain('5/6');
      expect(desc).toContain('83%');
      expect(desc).toContain('FULL');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Scenario 2: Raid with only melee DPS
  // ═══════════════════════════════════════════════════════════════
  describe('Scenario 2: Only melee DPS', () => {
    it('should show zero ranged DPS when raid has only melee', async () => {
      const raids = [
        makeRaid({
          id: 'r-melee-only',
          description: 'Melee Only Raid',
          attendance: [
            { userId: 'u1', username: 'Tank1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' },
            { userId: 'u2', username: 'Healer1', status: 'attending', wowClass: 'Priest', wowSpec: 'Holy' },
            { userId: 'u3', username: 'Melee1', status: 'attending', wowClass: 'Rogue', wowSpec: 'Assassination' },
            { userId: 'u4', username: 'Melee2', status: 'attending', wowClass: 'Warrior', wowSpec: 'Arms' },
            { userId: 'u5', username: 'Melee3', status: 'attending', wowClass: 'Paladin', wowSpec: 'Retribution' },
          ],
        }),
      ];

      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      const interaction = buildStatusInteraction();
      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      const desc = embed.data.description;

      expect(desc).toContain('⚔️ Melee DPS: 3');
      expect(desc).toContain('🏹 Ranged DPS: 0');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Scenario 3: Raid with only ranged DPS
  // ═══════════════════════════════════════════════════════════════
  describe('Scenario 3: Only ranged DPS', () => {
    it('should show zero melee DPS when raid has only ranged', async () => {
      const raids = [
        makeRaid({
          id: 'r-ranged-only',
          description: 'Ranged Only Raid',
          attendance: [
            { userId: 'u1', username: 'Tank1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' },
            { userId: 'u2', username: 'Healer1', status: 'attending', wowClass: 'Priest', wowSpec: 'Holy' },
            { userId: 'u3', username: 'Ranged1', status: 'attending', wowClass: 'Mage', wowSpec: 'Fire' },
            { userId: 'u4', username: 'Ranged2', status: 'attending', wowClass: 'Hunter', wowSpec: 'Marksmanship' },
          ],
        }),
      ];

      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      const interaction = buildStatusInteraction();
      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      const desc = embed.data.description;

      expect(desc).toContain('⚔️ Melee DPS: 0');
      expect(desc).toContain('🏹 Ranged DPS: 2');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Scenario 4: Raid with no DPS
  // ═══════════════════════════════════════════════════════════════
  describe('Scenario 4: No DPS in raid', () => {
    it('should show zero for both melee and ranged DPS', async () => {
      const raids = [
        makeRaid({
          id: 'r-no-dps',
          description: 'Tank/Healer Only Raid',
          attendance: [
            { userId: 'u1', username: 'Tank1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' },
            { userId: 'u2', username: 'Tank2', status: 'attending', wowClass: 'Paladin', wowSpec: 'Protection' },
            { userId: 'u3', username: 'Healer1', status: 'attending', wowClass: 'Priest', wowSpec: 'Holy' },
            { userId: 'u4', username: 'Healer2', status: 'attending', wowClass: 'Druid', wowSpec: 'Restoration' },
          ],
        }),
      ];

      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      const interaction = buildStatusInteraction();
      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      const desc = embed.data.description;

      expect(desc).toContain('⚔️ Melee DPS: 0');
      expect(desc).toContain('🏹 Ranged DPS: 0');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Scenario 5: Large raid (20+ players)
  // ═══════════════════════════════════════════════════════════════
  describe('Scenario 5: Large raid formatting', () => {
    it('should handle large raids without breaking formatting', async () => {
      const largeAttendance = Array.from({ length: 25 }, (_, i) => {
        const userId = `u${i + 1}`;
        const username = `Player${i + 1}`;
        let wowClass: string;
        let wowSpec: string;

        if (i < 2) {
          wowClass = 'Warrior';
          wowSpec = 'Protection'; // Tanks
        } else if (i < 5) {
          wowClass = 'Priest';
          wowSpec = 'Holy'; // Healers
        } else if (i % 2 === 0) {
          wowClass = 'Rogue';
          wowSpec = 'Assassination'; // Melee DPS
        } else {
          wowClass = 'Mage';
          wowSpec = 'Fire'; // Ranged DPS
        }

        return { userId, username, status: 'attending', wowClass, wowSpec };
      });

      const raids = [
        makeRaid({
          id: 'r-large',
          description: 'Large Raid',
          attendance: largeAttendance,
        }),
      ];

      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      const interaction = buildStatusInteraction();
      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      const desc = embed.data.description;

      // Should still format correctly with many players
      expect(desc).toContain('⚔️ Melee DPS:');
      expect(desc).toContain('🏹 Ranged DPS:');
      expect(desc).toContain('🛡️ 2');
      expect(desc).toContain('💚 3');

      // Count actual melee/ranged from the attendance
      const meleeCount = largeAttendance.filter(a =>
        a.status === 'attending' &&
        ['Rogue', 'Warrior', 'Paladin', 'Demon Hunter'].includes(a.wowClass!) &&
        ['Arms', 'Fury', 'Assassination', 'Combat', 'Havoc', 'Retribution'].includes(a.wowSpec!)
      ).length;
      const rangedCount = largeAttendance.filter(a =>
        a.status === 'attending' &&
        ['Mage', 'Hunter', 'Warlock', 'Priest', 'Druid'].includes(a.wowClass!) &&
        ['Fire', 'Frost', 'Arcane', 'Marksmanship', 'Beast Mastery', 'Survival', 'Affliction', 'Demonology', 'Destruction', 'Shadow', 'Balance'].includes(a.wowSpec!)
      ).length;

      expect(desc).toContain(`⚔️ Melee DPS: ${meleeCount}`);
      expect(desc).toContain(`🏹 Ranged DPS: ${rangedCount}`);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Scenario 6: Multiple raids with different compositions
  // ═══════════════════════════════════════════════════════════════
  describe('Scenario 6: Multiple raids', () => {
    it('should display multiple raids with correct DPS separation per raid', async () => {
      const raids = [
        makeRaid({
          id: 'r1',
          description: 'Melee Heavy Raid',
          raidDate: new Date(Date.now() + 86400000),
          attendance: [
            { userId: 'u1', username: 'Tank1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' },
            { userId: 'u2', username: 'Melee1', status: 'attending', wowClass: 'Rogue', wowSpec: 'Assassination' },
            { userId: 'u3', username: 'Melee2', status: 'attending', wowClass: 'Warrior', wowSpec: 'Arms' },
          ],
        }),
        makeRaid({
          id: 'r2',
          description: 'Ranged Heavy Raid',
          raidDate: new Date(Date.now() + 2 * 86400000),
          attendance: [
            { userId: 'u4', username: 'Tank2', status: 'attending', wowClass: 'Paladin', wowSpec: 'Protection' },
            { userId: 'u5', username: 'Ranged1', status: 'attending', wowClass: 'Mage', wowSpec: 'Fire' },
            { userId: 'u6', username: 'Ranged2', status: 'attending', wowClass: 'Hunter', wowSpec: 'Marksmanship' },
          ],
        }),
      ];

      (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

      const interaction = buildStatusInteraction();
      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      const desc = embed.data.description;

      // First raid: 2 melee, 0 ranged
      expect(desc).toContain('Melee Heavy Raid');
      expect(desc).toContain('⚔️ Melee DPS: 2');
      expect(desc).toContain('🏹 Ranged DPS: 0');

      // Second raid: 0 melee, 2 ranged
      expect(desc).toContain('Ranged Heavy Raid');
      expect(desc).toContain('⚔️ Melee DPS: 0');
      expect(desc).toContain('🏹 Ranged DPS: 2');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Scenario 7: No upcoming raids
  // ═══════════════════════════════════════════════════════════════
  describe('Scenario 7: No raids found', () => {
    it('should show no-raids message when no upcoming raids', async () => {
      (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);

      const interaction = buildStatusInteraction();
      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];

      expect(embed.data.title).toBe('Upcoming Raids');
      expect(embed.data.description).toBe('No upcoming raids scheduled.');
      expect(embed.data.color).toBe(0x808080);
    });
  });
});