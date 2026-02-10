/**
 * Integration Tests for /raid notes command (Task 2.3.4)
 *
 * Tests the full pipeline:
 *   Command handler → Database query → notesFormatter → embed
 *
 * Only Prisma is mocked; formatter functions run with real data.
 */

import { canManageRaids } from '../../../utils/permissions';

jest.mock('../../../database/client');
jest.mock('../../../utils/permissions');

import prisma from '../../../database/client';
import command from '../../raid';

// ─── Helpers ──────────────────────────────────────────────────────

const guildData = {
  id: 'guild-notes-test',
  name: 'Notes Test Guild',
  language: 'en',
  timezoneOffset: 0,
  raidLeaderRoles: 'role-leader',
  raidRoles: 'role-raider',
};

/**
 * Build a mock interaction targeting the notes subcommand.
 */
function buildNotesInteraction(
  raidId: string,
  extras: Record<string, any> = {},
) {
  return {
    isChatInputCommand: jest.fn().mockReturnValue(true),
    guild: { id: 'guild-notes-test', name: 'Notes Test Guild' },
    channel: { id: 'channel-notes-test' },
    member: {
      user: { bot: false, id: 'user-leader' },
      roles: { cache: new Map() },
    },
    user: { id: 'user-leader' },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    options: {
      getSubcommand: jest.fn().mockReturnValue('notes'),
      getString: jest.fn((key: string) => {
        if (key === 'raid_id') return raidId;
        return null;
      }),
    },
    ...extras,
  } as any;
}

/**
 * Build a mock Raid with attendance that has notes.
 */
function makeRaidWithNotes(raidId: string, notes: Array<{
  username: string;
  status: string;
  playerNote?: string;
  optoutReason?: string;
}>) {
  return {
    id: raidId,
    guildId: 'guild-notes-test',
    description: 'Test Raid',
    raidDate: new Date('2025-02-15T19:00:00Z'),
    status: 'open',
    createdAt: new Date('2025-02-08T10:00:00Z'),
    attendance: notes.map((n) => ({
      id: `att-${Math.random().toString(36).slice(2, 6)}`,
      raidId,
      userId: `user-${n.username.toLowerCase()}`,
      username: n.username,
      status: n.status,
      respondedAt: new Date('2025-02-10T12:00:00Z'),
      wowClass: 'Warrior',
      wowSpec: 'Prot',
      playerNote: n.playerNote || null,
      optoutReason: n.optoutReason || null,
      notedAt: n.playerNote || n.optoutReason ? new Date('2025-02-10T12:00:00Z') : null,
      createdAt: new Date('2025-02-08T10:00:00Z'),
      updatedAt: new Date('2025-02-10T12:00:00Z'),
      guildId: 'guild-notes-test',
    })),
  };
}

// ─── Test Suite ───────────────────────────────────────────────────

describe('Integration: /raid notes command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (canManageRaids as jest.Mock).mockResolvedValue(true);
  });

  test('should display player notes when present', async () => {
    const interaction = buildNotesInteraction('raid-with-notes');
    const raid = makeRaidWithNotes('raid-with-notes', [
      {
        username: 'Alice',
        status: 'attending',
        playerNote: 'I will be 10 minutes late',
      },
      {
        username: 'Bob',
        status: 'attending',
      },
    ]);

    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(guildData);
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

    await command.execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.editReply).toHaveBeenCalled();
    const editCall = (interaction.editReply as jest.Mock).mock.calls[0][0];
    
    expect(editCall.embeds).toBeDefined();
    const embed = editCall.embeds[0];
    expect(embed.data.title).toContain('Raid Notes');
    expect(embed.data.fields.some((f: any) => 
      f.name.includes('Player Comments')
    )).toBe(true);
  });

  test('should display opt-out reasons when present', async () => {
    const interaction = buildNotesInteraction('raid-opt-outs');
    const raid = makeRaidWithNotes('raid-opt-outs', [
      {
        username: 'Charlie',
        status: 'opted_out',
        optoutReason: 'Work meeting',
      },
      {
        username: 'Diana',
        status: 'opted_out',
        optoutReason: 'Family event',
      },
    ]);

    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(guildData);
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    const editCall = (interaction.editReply as jest.Mock).mock.calls[0][0];
    
    expect(editCall.embeds).toBeDefined();
    expect(editCall.embeds[0].data.fields.some((f: any) => 
      f.name.includes('Opt-Out Reasons')
    )).toBe(true);
  });

  test('should display both player notes and opt-out reasons', async () => {
    const interaction = buildNotesInteraction('raid-mixed');
    const raid = makeRaidWithNotes('raid-mixed', [
      {
        username: 'Eve',
        status: 'attending',
        playerNote: 'Might be a few minutes late',
      },
      {
        username: 'Frank',
        status: 'opted_out',
        optoutReason: 'Feeling sick',
      },
      {
        username: 'Grace',
        status: 'attending',
      },
    ]);

    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(guildData);
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    const editCall = (interaction.editReply as jest.Mock).mock.calls[0][0];
    
    expect(editCall.embeds).toBeDefined();
    const embed = editCall.embeds[0];
    expect(embed.data.fields.length).toBeGreaterThanOrEqual(2);
  });

  test('should show message when no notes exist', async () => {
    const interaction = buildNotesInteraction('raid-no-notes');
    const raid = makeRaidWithNotes('raid-no-notes', []);

    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(guildData);
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    const editCall = (interaction.editReply as jest.Mock).mock.calls[0][0];
    
    // Should show informational message
    expect(editCall.content || '').toContain('No notes');
  });

  test('should return error when raid not found', async () => {
    const interaction = buildNotesInteraction('nonexistent-raid');

    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(guildData);
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(null);

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    const editCall = (interaction.editReply as jest.Mock).mock.calls[0][0];
    expect(editCall.content).toContain('Raid not found');
  });

  test('should return error when raid belongs to different guild', async () => {
    const interaction = buildNotesInteraction('raid-other-guild');
    const raid = makeRaidWithNotes('raid-other-guild', []);
    raid.guildId = 'different-guild';

    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(guildData);
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    const editCall = (interaction.editReply as jest.Mock).mock.calls[0][0];
    expect(editCall.content).toContain('does not belong to your guild');
  });

  test('should return error when not in server', async () => {
    const interaction = buildNotesInteraction('raid-no-guild', {
      guild: null,
    });

    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
    expect(replyCall.content).toContain('server');
  });

  test('should handle German language properly', async () => {
    const germanGuild = { ...guildData, language: 'de' };
    const interaction = buildNotesInteraction('raid-german');
    const raid = makeRaidWithNotes('raid-german', [
      {
        username: 'Jack',
        status: 'attending',
        playerNote: 'Ich bin 10 Minuten zu spät',
      },
    ]);

    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(germanGuild);
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    const editCall = (interaction.editReply as jest.Mock).mock.calls[0][0];
    const embed = editCall.embeds[0];
    
    // German title should appear
    expect(embed.data.title).toContain('Raid-Notizen');
  });

  test('should include raid date in embed', async () => {
    const interaction = buildNotesInteraction('raid-date-test');
    const raidDate = new Date('2025-03-22T19:00:00Z');
    const raid = makeRaidWithNotes('raid-date-test', [
      {
        username: 'Kate',
        status: 'attending',
        playerNote: 'All set',
      },
    ]);
    raid.raidDate = raidDate;

    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(guildData);
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    const editCall = (interaction.editReply as jest.Mock).mock.calls[0][0];
    const embed = editCall.embeds[0];
    
    // Date should be formatted in description
    expect(embed.data.description).toContain('2025-03-22');
  });

  test('should handle raids with only player notes', async () => {
    const interaction = buildNotesInteraction('raid-player-notes-only');
    const raid = makeRaidWithNotes('raid-player-notes-only', [
      {
        username: 'Lisa',
        status: 'attending',
        playerNote: 'Need to leave early',
      },
      {
        username: 'Mike',
        status: 'late',
        playerNote: 'Traffic jam',
      },
    ]);

    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(guildData);
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    const editCall = (interaction.editReply as jest.Mock).mock.calls[0][0];
    const embed = editCall.embeds[0];
    
    // Should have player comments field
    expect(embed.data.fields.some((f: any) => f.name.includes('Player Comments'))).toBe(true);
    // Should NOT have opt-out reasons field (no opt-outs)
    expect(embed.data.fields.some((f: any) => f.name.includes('Opt-Out Reasons'))).toBe(false);
  });

  test('should handle raids with only opt-out reasons', async () => {
    const interaction = buildNotesInteraction('raid-optout-only');
    const raid = makeRaidWithNotes('raid-optout-only', [
      {
        username: 'Noah',
        status: 'opted_out',
        optoutReason: 'Vacation',
      },
      {
        username: 'Oscar',
        status: 'opted_out',
        optoutReason: 'Personal',
      },
    ]);

    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(guildData);
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    const editCall = (interaction.editReply as jest.Mock).mock.calls[0][0];
    const embed = editCall.embeds[0];
    
    // Should NOT have player comments field (no player notes)
    expect(embed.data.fields.some((f: any) => f.name.includes('Player Comments'))).toBe(false);
    // Should have opt-out reasons field
    expect(embed.data.fields.some((f: any) => f.name.includes('Opt-Out Reasons'))).toBe(true);
  });

  test('should display correct field counts', async () => {
    const interaction = buildNotesInteraction('raid-counts');
    const raid = makeRaidWithNotes('raid-counts', [
      {
        username: 'Paul',
        status: 'attending',
        playerNote: 'Note 1',
      },
      {
        username: 'Quinn',
        status: 'attending',
        playerNote: 'Note 2',
      },
      {
        username: 'Rachel',
        status: 'opted_out',
        optoutReason: 'Reason 1',
      },
    ]);

    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(guildData);
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    const editCall = (interaction.editReply as jest.Mock).mock.calls[0][0];
    const embed = editCall.embeds[0];
    
    // Check counts in field names
    const playerField = embed.data.fields.find((f: any) => f.name.includes('Player Comments'));
    const optoutField = embed.data.fields.find((f: any) => f.name.includes('Opt-Out Reasons'));
    
    expect(playerField.name).toContain('(2)');
    expect(optoutField.name).toContain('(1)');
  });
});
