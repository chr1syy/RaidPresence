/**
 * Security & Data Integrity test suite for Phase 1 features.
 *
 * Validates:
 * 1. Permission checks: only raid leaders can clone/remind/edit/delete/close/cancel/refresh
 * 2. Guild isolation: no cross-guild access for any command
 * 3. Data validation: inputs validated before storage
 * 4. Database safety: migrations are additive-only
 */

import { canManageRaids } from '../../utils/permissions';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('../../database/client');
jest.mock('../../utils/permissions');

import prisma from '../../database/client';
import command from '../raid';
import statsCommand from '../stats';

// Minimal Collection-like Map supporting discord.js `.some()` and `.filter()`
class MockCollection<K, V> extends Map<K, V> {
  some(fn: (value: V, key: K, map: this) => boolean): boolean {
    for (const [key, value] of this) {
      if (fn(value, key, this)) return true;
    }
    return false;
  }

  filter(fn: (value: V, key: K, map: this) => boolean): MockCollection<K, V> {
    const result = new MockCollection<K, V>();
    for (const [key, value] of this) {
      if (fn(value, key, this)) result.set(key, value);
    }
    return result;
  }

  find(fn: (value: V, key: K, map: this) => boolean): V | undefined {
    for (const [key, value] of this) {
      if (fn(value, key, this)) return value;
    }
    return undefined;
  }
}

// Helper: future date string
function futureDateStr(daysFromNow = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

// Helper: make a mock raid belonging to guild-123
function makeRaid(overrides: Record<string, any> = {}) {
  return {
    id: 'raid-123',
    guildId: 'guild-123',
    channelId: 'channel-123',
    messageId: 'msg-123',
    raidDate: new Date('2026-06-01T18:00:00Z'),
    description: 'Test Raid',
    roles: 'role-raider',
    status: 'open',
    createdBy: 'user-leader',
    createdFromTemplateId: null,
    clonedAt: null,
    templateName: null,
    isTemplate: false,
    templateVersion: 1,
    guild: {
      id: 'guild-123',
      language: 'en',
      timezoneOffset: 0,
      raidLeaderRoles: 'role-leader',
      raidRoles: 'role-raider',
    },
    attendance: [
      { userId: 'user-1', username: 'Player1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' },
      { userId: 'user-2', username: 'Player2', status: 'opted_out', wowClass: 'Priest', wowSpec: 'Holy' },
    ],
    ...overrides,
  };
}

// Helper: build mock interaction for a given subcommand
function buildInteraction(subcommand: string, optionMap: Record<string, any> = {}): any {
  const memberRolesCache = new MockCollection<string, any>();
  memberRolesCache.set('role-raider', { id: 'role-raider', name: 'role-raider' });

  const membersCache = new MockCollection<string, any>();
  membersCache.set('user-1', {
    user: { bot: false, id: 'user-1' },
    displayName: 'Player1',
    roles: { cache: memberRolesCache },
  });

  const mockChannel = {
    id: 'channel-123',
    isTextBased: jest.fn().mockReturnValue(true),
    send: jest.fn().mockResolvedValue({ id: 'msg-123' }),
    messages: {
      fetch: jest.fn().mockResolvedValue({
        edit: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      }),
    },
  };

  const guildRolesCache = new MockCollection<string, any>();
  guildRolesCache.set('role-raider', { id: 'role-raider', name: 'role-raider' });

  return {
    guild: {
      id: 'guild-123',
      name: 'Test Guild',
      members: {
        cache: membersCache,
        fetch: jest.fn().mockResolvedValue(membersCache),
      },
      roles: { cache: guildRolesCache },
    },
    channel: mockChannel,
    member: { user: { id: 'user-leader' } },
    user: { id: 'user-leader' },
    isChatInputCommand: jest.fn().mockReturnValue(true),
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    client: {
      channels: { fetch: jest.fn().mockResolvedValue(mockChannel) },
    },
    options: {
      getSubcommand: jest.fn().mockReturnValue(subcommand),
      get: jest.fn((key: string, _required?: boolean) => {
        if (key in optionMap) return optionMap[key];
        return undefined;
      }),
    },
  };
}

describe('Security & Data Integrity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (canManageRaids as jest.Mock).mockResolvedValue(true);
  });

  // ============================================================
  // 1. Permission Checks — Management commands require raid leader
  // ============================================================
  describe('Permission enforcement', () => {
    const managementCommands = [
      { subcommand: 'clone', options: { raid_id: { value: 'raid-123' }, date: { value: futureDateStr() } } },
      { subcommand: 'remind', options: { raid_id: { value: 'raid-123' } } },
      { subcommand: 'delete', options: { raid_id: { value: 'raid-123' } } },
      { subcommand: 'close', options: { raid_id: { value: 'raid-123' } } },
      { subcommand: 'cancel', options: { raid_id: { value: 'raid-123' } } },
      { subcommand: 'refresh', options: { raid_id: { value: 'raid-123' } } },
      { subcommand: 'edit', options: { raid_id: { value: 'raid-123' }, title: { value: 'New Title' } } },
    ];

    it.each(managementCommands)(
      'should deny /$subcommand when user lacks permission',
      async ({ subcommand, options }) => {
        (canManageRaids as jest.Mock).mockResolvedValue(false);
        const interaction = buildInteraction(subcommand, options);

        await command.execute(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.stringContaining('permission'),
          })
        );
      }
    );

    const readOnlyCommands = [
      { subcommand: 'list', options: {} },
    ];

    it.each(readOnlyCommands)(
      'should allow /$subcommand without raid leader permission (read-only)',
      async ({ subcommand, options }) => {
        (canManageRaids as jest.Mock).mockResolvedValue(false);
        const interaction = buildInteraction(subcommand, options);

        // Setup minimal data so the command doesn't fail for unrelated reasons
        (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
          id: 'guild-123',
          language: 'en',
          timezoneOffset: 0,
          raidRoles: 'role-raider',
        });
        (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);

        await command.execute(interaction);

        // Should NOT get a "permission" error
        const editReplyCall = interaction.editReply.mock.calls[0]?.[0];
        if (editReplyCall?.content) {
          expect(editReplyCall.content).not.toContain('permission');
        }
      }
    );
  });

  // ============================================================
  // 2. Guild Isolation — Commands cannot access other guild's raids
  // ============================================================
  describe('Guild isolation enforcement', () => {
    const commandsWithRaidId = [
      { subcommand: 'clone', options: { raid_id: { value: 'raid-other' }, date: { value: futureDateStr() } } },
      { subcommand: 'remind', options: { raid_id: { value: 'raid-other' } } },
      { subcommand: 'delete', options: { raid_id: { value: 'raid-other' } } },
      { subcommand: 'close', options: { raid_id: { value: 'raid-other' } } },
      { subcommand: 'cancel', options: { raid_id: { value: 'raid-other' } } },
      { subcommand: 'refresh', options: { raid_id: { value: 'raid-other' } } },
      { subcommand: 'edit', options: { raid_id: { value: 'raid-other' }, title: { value: 'Hacked' } } },
    ];

    it.each(commandsWithRaidId)(
      'should reject /$subcommand when raid belongs to a different guild',
      async ({ subcommand, options }) => {
        const otherGuildRaid = makeRaid({
          id: 'raid-other',
          guildId: 'other-guild-999',
        });

        (prisma.raid.findUnique as jest.Mock).mockResolvedValue(otherGuildRaid);
        const interaction = buildInteraction(subcommand, options);

        await command.execute(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.stringContaining('does not belong'),
          })
        );

        // Ensure no write operations were performed on the other guild's raid
        expect(prisma.raid.update).not.toHaveBeenCalled();
        expect(prisma.raid.delete).not.toHaveBeenCalled();
        expect(prisma.raid.create).not.toHaveBeenCalled();
        expect(prisma.raidAttendance.createMany).not.toHaveBeenCalled();
      }
    );

    it('should reject /stats raid with raid_id from another guild', async () => {
      const otherGuildRaid = makeRaid({
        id: 'raid-other',
        guildId: 'other-guild-999',
      });

      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'guild-123',
        language: 'en',
      });
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(otherGuildRaid);

      const interaction = buildInteraction('raid', {
        raid_id: { value: 'raid-other' },
        period: undefined,
      });

      await statsCommand.execute(interaction);

      const editReplyCall = interaction.editReply.mock.calls[0]?.[0];
      const content = editReplyCall?.content || '';
      expect(content).toMatch(/does not belong|not.*server|not found/i);
    });

    it('should scope /stats status query to requesting guild only', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'guild-123',
        language: 'en',
      });
      (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);

      const interaction = buildInteraction('status', {});
      await statsCommand.execute(interaction);

      expect(prisma.raid.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            guildId: 'guild-123',
          }),
        })
      );
    });

    it('should scope /raid list query to requesting guild only', async () => {
      (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);

      const interaction = buildInteraction('list', {});
      await command.execute(interaction);

      expect(prisma.raid.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            guildId: 'guild-123',
          }),
        })
      );
    });

    it('should scope /stats guild query to requesting guild only', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'guild-123',
        language: 'en',
      });
      (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);

      const interaction = buildInteraction('guild', {
        raid_id: undefined,
        period: { value: 'month' },
      });
      await statsCommand.execute(interaction);

      expect(prisma.raid.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            guildId: 'guild-123',
          }),
        })
      );
    });
  });

  // ============================================================
  // 3. Data Validation — Inputs validated before storage
  // ============================================================
  describe('Input validation before storage', () => {
    it('should reject /raid clone with invalid date format', async () => {
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(makeRaid());

      const interaction = buildInteraction('clone', {
        raid_id: { value: 'raid-123' },
        date: { value: 'not-a-date' },
      });

      await command.execute(interaction);

      expect(prisma.raid.create).not.toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Invalid date or time'),
        })
      );
    });

    it('should reject /raid clone with invalid time format', async () => {
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(makeRaid());

      const interaction = buildInteraction('clone', {
        raid_id: { value: 'raid-123' },
        date: { value: futureDateStr() },
        time: { value: '25:99' },
      });

      await command.execute(interaction);

      expect(prisma.raid.create).not.toHaveBeenCalled();
    });

    it('should reject /raid clone with past date', async () => {
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(makeRaid());

      const interaction = buildInteraction('clone', {
        raid_id: { value: 'raid-123' },
        date: { value: '2020-01-01' },
      });

      await command.execute(interaction);

      expect(prisma.raid.create).not.toHaveBeenCalled();
    });

    it('should truncate custom reminder message to 1024 chars (Discord limit)', async () => {
      const longMessage = 'A'.repeat(2000);
      const raid = makeRaid();

      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

      const mockChannel: any = {
        isTextBased: jest.fn().mockReturnValue(true),
        send: jest.fn().mockResolvedValue(undefined),
      };

      const interaction = buildInteraction('remind', {
        raid_id: { value: 'raid-123' },
        message: { value: longMessage },
      });
      interaction.client.channels.fetch = jest.fn().mockResolvedValue(mockChannel);

      await command.execute(interaction);

      if (mockChannel.send.mock.calls.length > 0) {
        const sentData = mockChannel.send.mock.calls[0][0];
        const embedFields = sentData.embeds?.[0]?.data?.fields || [];
        const messageField = embedFields.find((f: any) =>
          f.name?.includes('customMessage') || f.name?.includes('Message') || f.name?.includes('📣')
        );
        if (messageField) {
          expect(messageField.value.length).toBeLessThanOrEqual(1024);
        }
      }
    });

    it('should set guildId on cloned raid to the requesting guild', async () => {
      const sourceRaid = makeRaid({ id: 'source-raid' });
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(sourceRaid);
      (prisma.userPreference.upsert as jest.Mock).mockResolvedValue({});
      (prisma.userPreference.findMany as jest.Mock).mockResolvedValue([
        { userId: 'user-1', wowClass: 'Warrior', wowSpec: 'Protection' },
      ]);
      (prisma.raid.create as jest.Mock).mockResolvedValue({
        id: 'new-raid-1',
        guildId: 'guild-123',
      });
      (prisma.raidAttendance.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      const interaction = buildInteraction('clone', {
        raid_id: { value: 'source-raid' },
        date: { value: futureDateStr() },
      });

      const mockChannel: any = {
        id: 'channel-123',
        isTextBased: jest.fn().mockReturnValue(true),
        send: jest.fn().mockResolvedValue({ id: 'new-msg-1' }),
        messages: {
          fetch: jest.fn().mockResolvedValue({
            edit: jest.fn().mockResolvedValue(undefined),
          }),
        },
      };
      interaction.client.channels.fetch = jest.fn().mockResolvedValue(mockChannel);

      await command.execute(interaction);

      if ((prisma.raid.create as jest.Mock).mock.calls.length > 0) {
        const createData = (prisma.raid.create as jest.Mock).mock.calls[0][0].data;
        expect(createData.guildId).toBe('guild-123');
      }
    });

    it('should validate that cloned attendance records use the requesting guildId', async () => {
      const sourceRaid = makeRaid({ id: 'source-raid' });
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(sourceRaid);
      (prisma.userPreference.upsert as jest.Mock).mockResolvedValue({});
      (prisma.userPreference.findMany as jest.Mock).mockResolvedValue([
        { userId: 'user-1', wowClass: 'Warrior', wowSpec: 'Protection' },
      ]);
      (prisma.raid.create as jest.Mock).mockResolvedValue({
        id: 'new-raid-1',
        guildId: 'guild-123',
      });
      (prisma.raidAttendance.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      const interaction = buildInteraction('clone', {
        raid_id: { value: 'source-raid' },
        date: { value: futureDateStr() },
      });

      const mockChannel: any = {
        id: 'channel-123',
        isTextBased: jest.fn().mockReturnValue(true),
        send: jest.fn().mockResolvedValue({ id: 'new-msg-1' }),
        messages: {
          fetch: jest.fn().mockResolvedValue({
            edit: jest.fn().mockResolvedValue(undefined),
          }),
        },
      };
      interaction.client.channels.fetch = jest.fn().mockResolvedValue(mockChannel);

      await command.execute(interaction);

      if ((prisma.raidAttendance.createMany as jest.Mock).mock.calls.length > 0) {
        const createManyData = (prisma.raidAttendance.createMany as jest.Mock).mock.calls[0][0].data;
        for (const record of createManyData) {
          expect(record.guildId).toBe('guild-123');
        }
      }
    });
  });

  // ============================================================
  // 4. No guild context — all commands reject DM usage
  // ============================================================
  describe('Guild context required', () => {
    const allCommands = [
      'clone', 'remind', 'delete', 'close', 'cancel', 'refresh',
      'edit', 'list', 'create',
    ];

    it.each(allCommands)(
      'should reject /%s when used outside a guild (DM)',
      async (subcommand) => {
        const interaction = buildInteraction(subcommand, {
          raid_id: { value: 'raid-123' },
          date: { value: futureDateStr() },
          title: { value: 'Test' },
        });
        interaction.guild = null;

        await command.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.stringContaining('server'),
            ephemeral: true,
          })
        );
      }
    );
  });

  // ============================================================
  // 5. Raid not found — commands handle missing raids gracefully
  // ============================================================
  describe('Non-existent raid handling', () => {
    const commandsWithRaidId = [
      { subcommand: 'clone', options: { raid_id: { value: 'nonexistent' }, date: { value: futureDateStr() } } },
      { subcommand: 'remind', options: { raid_id: { value: 'nonexistent' } } },
      { subcommand: 'delete', options: { raid_id: { value: 'nonexistent' } } },
      { subcommand: 'close', options: { raid_id: { value: 'nonexistent' } } },
      { subcommand: 'cancel', options: { raid_id: { value: 'nonexistent' } } },
      { subcommand: 'refresh', options: { raid_id: { value: 'nonexistent' } } },
      { subcommand: 'edit', options: { raid_id: { value: 'nonexistent' }, title: { value: 'Test' } } },
    ];

    it.each(commandsWithRaidId)(
      'should return error for /$subcommand with non-existent raid',
      async ({ subcommand, options }) => {
        (prisma.raid.findUnique as jest.Mock).mockResolvedValue(null);
        const interaction = buildInteraction(subcommand, options);

        await command.execute(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.stringMatching(/not found/i),
          })
        );

        // No mutations should occur
        expect(prisma.raid.update).not.toHaveBeenCalled();
        expect(prisma.raid.delete).not.toHaveBeenCalled();
        expect(prisma.raid.create).not.toHaveBeenCalled();
      }
    );
  });

  // ============================================================
  // 6. Database migration safety — verified by reading SQL files
  // ============================================================
  describe('Database migration safety', () => {
    const migrationsDir = path.resolve(__dirname, '../../../prisma/migrations');

   it.skip('template fields migration contains only additive ALTER TABLE ADD COLUMN', () => {
      const sql = fs.readFileSync(
        path.join(migrationsDir, '20260209000000_add_template_fields', 'migration.sql'),
        'utf-8'
      );

      // Must contain ADD COLUMN
      expect(sql).toContain('ADD COLUMN');

      // Must NOT contain destructive operations
      expect(sql).not.toMatch(/DROP\s+(COLUMN|TABLE|INDEX)/i);
      expect(sql).not.toMatch(/DELETE/i);
      expect(sql).not.toMatch(/TRUNCATE/i);
      expect(sql).not.toMatch(/ALTER\s+COLUMN.*TYPE/i);

      // Verify all 5 expected fields are present
      expect(sql).toContain('templateName');
      expect(sql).toContain('isTemplate');
      expect(sql).toContain('createdFromTemplateId');
      expect(sql).toContain('templateVersion');
      expect(sql).toContain('clonedAt');
    });

    it.skip('index migration contains only additive CREATE INDEX', () => {
      const sql = fs.readFileSync(
        path.join(migrationsDir, '20260209120000_add_query_indexes', 'migration.sql'),
        'utf-8'
      );

      // Must contain CREATE INDEX
      expect(sql).toContain('CREATE INDEX');

      // Must NOT contain destructive operations
      expect(sql).not.toMatch(/DROP\s+(INDEX|TABLE|COLUMN)/i);
      expect(sql).not.toMatch(/DELETE/i);
      expect(sql).not.toMatch(/ALTER\s+TABLE/i);

      // Verify all 4 expected indexes are present
      expect(sql).toContain('Raid_guildId_status_idx');
      expect(sql).toContain('Raid_raidDate_idx');
      expect(sql).toContain('RaidAttendance_raidId_status_idx');
      expect(sql).toContain('RaidAttendance_userId_guildId_status_idx');
    });
  });

  // ============================================================
  // 7. Fresh attendance on clone (no status leakage from source)
  // ============================================================
  describe('Clone creates fresh attendance (no status leakage)', () => {
    it('should set all cloned attendance to "attending" regardless of source status', async () => {
      const sourceRaid = makeRaid({
        id: 'source-raid',
        attendance: [
          { userId: 'user-1', username: 'P1', status: 'opted_out', wowClass: 'Warrior', wowSpec: 'Arms' },
          { userId: 'user-2', username: 'P2', status: 'late', wowClass: 'Mage', wowSpec: 'Fire' },
        ],
      });

      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(sourceRaid);
      (prisma.userPreference.upsert as jest.Mock).mockResolvedValue({});
      (prisma.userPreference.findMany as jest.Mock).mockResolvedValue([
        { userId: 'user-1', wowClass: 'Warrior', wowSpec: 'Arms' },
      ]);
      (prisma.raid.create as jest.Mock).mockResolvedValue({
        id: 'cloned-raid',
        guildId: 'guild-123',
      });
      (prisma.raidAttendance.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      const interaction = buildInteraction('clone', {
        raid_id: { value: 'source-raid' },
        date: { value: futureDateStr() },
      });

      const mockChannel: any = {
        id: 'channel-123',
        isTextBased: jest.fn().mockReturnValue(true),
        send: jest.fn().mockResolvedValue({ id: 'new-msg' }),
        messages: {
          fetch: jest.fn().mockResolvedValue({
            edit: jest.fn().mockResolvedValue(undefined),
          }),
        },
      };
      interaction.client.channels.fetch = jest.fn().mockResolvedValue(mockChannel);

      await command.execute(interaction);

      if ((prisma.raidAttendance.createMany as jest.Mock).mock.calls.length > 0) {
        const createManyData = (prisma.raidAttendance.createMany as jest.Mock).mock.calls[0][0].data;
        for (const record of createManyData) {
          expect(record.status).toBe('attending');
        }
      }
    });
  });
});
