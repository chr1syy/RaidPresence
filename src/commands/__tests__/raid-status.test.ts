/**
 * Test suite for handleStatusCommand() function
 * Tests: upcoming raids display, sorting, limit, no raids, guild isolation,
 * error handling, and localization.
 */

import { canManageRaids } from '../../utils/permissions';

jest.mock('../../database/client');
jest.mock('../../utils/permissions');

import prisma from '../../database/client';
import command from '../raid';

function buildMockInteraction(extras: Record<string, any> = {}) {
  const mockInteraction: any = {
    isChatInputCommand: jest.fn().mockReturnValue(true),
    guild: {
      id: 'guild-123',
      name: 'Test Guild',
    },
    channel: {
      id: 'channel-123',
    },
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
      get: jest.fn(() => undefined),
    },
    ...extras,
  };

  return mockInteraction;
}

function makeRaid(overrides: Record<string, any> = {}) {
  return {
    id: 'raid-1',
    guildId: 'guild-123',
    channelId: 'channel-123',
    raidDate: new Date('2026-03-01T18:00:00Z'),
    description: 'Mythic Raid Night',
    roles: 'role-raider',
    status: 'open',
    createdBy: 'user-leader',
    messageId: 'msg-1',
    attendance: [
      { id: 'a1', raidId: 'raid-1', userId: 'u1', guildId: 'guild-123', username: 'Player1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' },
      { id: 'a2', raidId: 'raid-1', userId: 'u2', guildId: 'guild-123', username: 'Player2', status: 'attending', wowClass: 'Priest', wowSpec: 'Holy' },
      { id: 'a3', raidId: 'raid-1', userId: 'u3', guildId: 'guild-123', username: 'Player3', status: 'opted_out', wowClass: 'Rogue', wowSpec: 'Assassination' },
      { id: 'a4', raidId: 'raid-1', userId: 'u4', guildId: 'guild-123', username: 'Player4', status: 'late', wowClass: 'Mage', wowSpec: 'Fire' },
      { id: 'a5', raidId: 'raid-1', userId: 'u5', guildId: 'guild-123', username: 'Player5', status: 'attending', wowClass: 'Hunter', wowSpec: 'Beast Mastery' },
    ],
    ...overrides,
  };
}

describe('/raid status command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (canManageRaids as jest.Mock).mockResolvedValue(true);
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      id: 'guild-123',
      language: 'en',
      timezoneOffset: 0,
    });
  });

  it('should show upcoming raids with embed', async () => {
    const raids = [makeRaid()];
    (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

    const interaction = buildMockInteraction();
    await command.execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(prisma.raid.findMany).toHaveBeenCalledTimes(1);

    const findManyArgs = (prisma.raid.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyArgs.where.guildId).toBe('guild-123');
    expect(findManyArgs.where.status).toBe('open');
    expect(findManyArgs.orderBy.raidDate).toBe('asc');
    expect(findManyArgs.take).toBe(7);

    const replyArg = interaction.editReply.mock.calls[0][0];
    expect(replyArg.embeds).toBeDefined();
    expect(replyArg.embeds.length).toBe(1);

    const embed = replyArg.embeds[0];
    expect(embed.data.title).toBe('Upcoming Raids');
    expect(embed.data.description).toContain('Mythic Raid Night');
  });

  it('should return message when no upcoming raids', async () => {
    (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);

    const interaction = buildMockInteraction();
    await command.execute(interaction);

    const reply = interaction.editReply.mock.calls[0][0];
    expect(reply.content).toBe('No upcoming raids scheduled.');
  });

  it('should show multiple raids sorted chronologically', async () => {
    const raids = [
      makeRaid({ id: 'r1', description: 'Early Raid', raidDate: new Date('2026-03-01T18:00:00Z') }),
      makeRaid({ id: 'r2', description: 'Mid Raid', raidDate: new Date('2026-03-05T18:00:00Z') }),
      makeRaid({ id: 'r3', description: 'Late Raid', raidDate: new Date('2026-03-10T18:00:00Z') }),
    ];
    (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

    const interaction = buildMockInteraction();
    await command.execute(interaction);

    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    const desc = embed.data.description;

    // Verify order by checking that Early appears before Mid, Mid before Late
    const earlyIdx = desc.indexOf('Early Raid');
    const midIdx = desc.indexOf('Mid Raid');
    const lateIdx = desc.indexOf('Late Raid');
    expect(earlyIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(lateIdx);
  });

  it('should only query open raids in the future', async () => {
    (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);

    const interaction = buildMockInteraction();
    await command.execute(interaction);

    const findManyArgs = (prisma.raid.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyArgs.where.status).toBe('open');
    expect(findManyArgs.where.raidDate.gte).toBeInstanceOf(Date);
    // The date should be approximately "now"
    const timeDiff = Math.abs(Date.now() - findManyArgs.where.raidDate.gte.getTime());
    expect(timeDiff).toBeLessThan(5000); // within 5 seconds
  });

  it('should show correct roster percentage', async () => {
    // 4 attending/late out of 5 = 80%
    const raids = [makeRaid()];
    (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

    const interaction = buildMockInteraction();
    await command.execute(interaction);

    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    expect(embed.data.description).toContain('4/5');
    expect(embed.data.description).toContain('80%');
  });

  it('should show correct role composition', async () => {
    const raids = [makeRaid()];
    (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

    const interaction = buildMockInteraction();
    await command.execute(interaction);

    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    const desc = embed.data.description;

    // Tank: 1 (Warrior/Prot), Healer: 1 (Priest/Holy), DPS: 2 (Mage/Fire + Hunter/BM)
    expect(desc).toContain('🛡️ 1');
    expect(desc).toContain('💚 1');
    expect(desc).toContain('⚔️ 2');
  });

  it('should show correct status indicators', async () => {
    // FULL (80%) raid
    const fullRaid = makeRaid({ id: 'r1', description: 'Full Raid' });
    // LOW (20%) raid
    const lowRaid = makeRaid({
      id: 'r2',
      description: 'Low Raid',
      raidDate: new Date('2026-03-05T18:00:00Z'),
      attendance: [
        { id: 'a1', raidId: 'r2', userId: 'u1', guildId: 'guild-123', username: 'P1', status: 'attending', wowClass: null, wowSpec: null },
        ...Array.from({ length: 9 }, (_, i) => ({
          id: `a${i + 2}`, raidId: 'r2', userId: `u${i + 2}`, guildId: 'guild-123',
          username: `P${i + 2}`, status: 'opted_out', wowClass: null, wowSpec: null,
        })),
      ],
    });
    (prisma.raid.findMany as jest.Mock).mockResolvedValue([fullRaid, lowRaid]);

    const interaction = buildMockInteraction();
    await command.execute(interaction);

    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    expect(embed.data.description).toContain('✅ FULL');
    expect(embed.data.description).toContain('⚠️ LOW');
    // When any is LOW, embed color should be red
    expect(embed.data.color).toBe(0xff4500);
  });

  it('should reject when used outside a guild', async () => {
    const interaction = buildMockInteraction({ guild: null });
    await command.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining('server'),
      ephemeral: true,
    });
  });

  it('should handle guild not found in database', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue(null);

    const interaction = buildMockInteraction();
    await command.execute(interaction);

    const reply = interaction.editReply.mock.calls[0][0];
    expect(reply.content).toContain('Guild not found');
  });

  it('should use German translations', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      id: 'guild-123',
      language: 'de',
      timezoneOffset: 0,
    });

    const raids = [makeRaid()];
    (prisma.raid.findMany as jest.Mock).mockResolvedValue(raids);

    const interaction = buildMockInteraction();
    await command.execute(interaction);

    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toBe('Anstehende Raids');
    expect(embed.data.description).toContain('Aufstellung');
    expect(embed.data.description).toContain('VOLL');
  });

  it('should show German no-raids message', async () => {
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      id: 'guild-123',
      language: 'de',
      timezoneOffset: 0,
    });
    (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);

    const interaction = buildMockInteraction();
    await command.execute(interaction);

    const reply = interaction.editReply.mock.calls[0][0];
    expect(reply.content).toBe('Keine anstehenden Raids geplant.');
  });

  it('should include attendance data in query', async () => {
    (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);

    const interaction = buildMockInteraction();
    await command.execute(interaction);

    const findManyArgs = (prisma.raid.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyArgs.include.attendance).toBe(true);
  });
});
