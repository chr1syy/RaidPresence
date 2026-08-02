/**
 * Test suite for team awareness of the /stats command (RPTIER Phase 4).
 * Tests: team scoping of `guild`, `status` and `attendance`, the `teamNotFound` path,
 * and the team name shown in embed titles on multi-team guilds only.
 */

jest.mock('../../database/client');
jest.mock('../../utils/permissions');
jest.mock('../../middleware/premiumGate', () => ({
  gateFeature: jest.fn().mockResolvedValue(true),
  freeTierHint: jest.fn().mockResolvedValue(''),
  premiumFooterHint: jest.fn().mockReturnValue(''),
}));
jest.mock('../../services/entitlementService', () => ({
  getTier: jest.fn().mockResolvedValue('PREMIUM'),
  hasFeature: jest.fn().mockReturnValue(true),
  tryConsumeWeeklyRaid: jest.fn().mockResolvedValue({ allowed: true, remaining: 4 }),
  skuToTier: jest.fn(),
  FEATURE_TIERS: {},
  PremiumTier: {},
}));

import prisma from '../../database/client';
import command from '../stats';
import { freeTierHint } from '../../middleware/premiumGate';

const DEFAULT_TEAM = {
  id: 'team-default',
  guildId: 'guild-123',
  name: 'Main',
  isDefault: true,
  createdBy: 'system',
};

const NAMED_TEAM = {
  id: 'team-alpha',
  guildId: 'guild-123',
  name: 'Alpha',
  isDefault: false,
  createdBy: 'user-leader',
};

function buildMockInteraction(
  subcommand: string,
  options: Record<string, any> = {},
) {
  return {
    isChatInputCommand: jest.fn().mockReturnValue(true),
    guild: { id: 'guild-123', name: 'Test Guild' },
    guildId: 'guild-123',
    channel: { id: 'channel-123' },
    member: { user: { bot: false, id: 'user-leader' }, roles: { cache: new Map() } },
    user: { id: 'user-leader' },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    options: {
      getSubcommand: jest.fn().mockReturnValue(subcommand),
      get: jest.fn((key: string, required?: boolean) =>
        options[key] || (required ? { value: null } : undefined)),
    },
  } as any;
}

/** Makes the guild look like it runs several teams, so labels are shown. */
function withMultipleTeams(team = NAMED_TEAM) {
  (prisma.team.count as jest.Mock).mockResolvedValue(2);
  (prisma.team.findUnique as jest.Mock).mockResolvedValue(team);
}

describe('/stats team awareness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (freeTierHint as jest.Mock).mockResolvedValue('');
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      id: 'guild-123',
      language: 'en',
      timezone: 'UTC',
    });
    (prisma.team.findFirst as jest.Mock).mockResolvedValue(DEFAULT_TEAM);
    (prisma.team.count as jest.Mock).mockResolvedValue(1);
    (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);
  });

  // ── stats guild ─────────────────────────────────────────────

  describe('guild', () => {
    it('scopes to the default team when no team option is given', async () => {
      await command.execute(buildMockInteraction('guild'));

      const args = (prisma.raid.findMany as jest.Mock).mock.calls[0][0];
      expect(args.where.guildId).toBe('guild-123');
      expect(args.where.teamId).toBe('team-default');
    });

    it('scopes to a named team', async () => {
      (prisma.team.findFirst as jest.Mock).mockResolvedValue(NAMED_TEAM);

      await command.execute(buildMockInteraction('guild', { team: { value: 'Alpha' } }));

      const args = (prisma.raid.findMany as jest.Mock).mock.calls[0][0];
      expect(args.where.teamId).toBe('team-alpha');
    });

    it('reports an unknown team and does not query raids', async () => {
      (prisma.team.findFirst as jest.Mock).mockResolvedValue(null);

      const interaction = buildMockInteraction('guild', { team: { value: 'Ghost' } });
      await command.execute(interaction);

      expect(interaction.editReply.mock.calls[0][0].content).toContain('Ghost');
      expect(prisma.raid.findMany).not.toHaveBeenCalled();
    });

    it('names the team in the title when the guild has several teams', async () => {
      (prisma.team.findFirst as jest.Mock).mockResolvedValue(NAMED_TEAM);
      withMultipleTeams();

      const interaction = buildMockInteraction('guild', { team: { value: 'Alpha' } });
      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.title).toContain('— Alpha');
    });

    it('leaves the title untouched for single-team guilds', async () => {
      const interaction = buildMockInteraction('guild');
      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.title).not.toContain('—');
      expect(prisma.team.findUnique).not.toHaveBeenCalled();
    });
  });

  // ── stats status ────────────────────────────────────────────

  describe('status', () => {
    it('scopes upcoming raids to the resolved team', async () => {
      (prisma.team.findFirst as jest.Mock).mockResolvedValue(NAMED_TEAM);

      await command.execute(buildMockInteraction('status', { team: { value: 'Alpha' } }));

      const args = (prisma.raid.findMany as jest.Mock).mock.calls[0][0];
      expect(args.where.teamId).toBe('team-alpha');
      expect(args.where.status).toBe('open');
    });

    it('reports an unknown team and does not query raids', async () => {
      (prisma.team.findFirst as jest.Mock).mockResolvedValue(null);

      const interaction = buildMockInteraction('status', { team: { value: 'Ghost' } });
      await command.execute(interaction);

      expect(interaction.editReply.mock.calls[0][0].content).toContain('Ghost');
      expect(prisma.raid.findMany).not.toHaveBeenCalled();
    });

    it('names the team in the title on multi-team guilds', async () => {
      (prisma.team.findFirst as jest.Mock).mockResolvedValue(NAMED_TEAM);
      withMultipleTeams();

      const interaction = buildMockInteraction('status', { team: { value: 'Alpha' } });
      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.title).toContain('— Alpha');
    });
  });

  // ── stats attendance ────────────────────────────────────────

  describe('attendance', () => {
    const player = { value: 'user-9', user: { id: 'user-9', username: 'Raider', displayName: 'Raider' } };

    it('passes the team to the analytics queries', async () => {
      (prisma.team.findFirst as jest.Mock).mockResolvedValue(NAMED_TEAM);

      await command.execute(buildMockInteraction('attendance', { player, team: { value: 'Alpha' } }));

      const calls = (prisma.raidAttendance.findMany as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      for (const [args] of calls) {
        expect(args.where.teamId).toBe('team-alpha');
        expect(args.where.userId).toBe('user-9');
      }
    });

    it('falls back to the default team', async () => {
      await command.execute(buildMockInteraction('attendance', { player }));

      const [args] = (prisma.raidAttendance.findMany as jest.Mock).mock.calls[0];
      expect(args.where.teamId).toBe('team-default');
    });

    it('reports an unknown team and runs no analytics query', async () => {
      (prisma.team.findFirst as jest.Mock).mockResolvedValue(null);

      const interaction = buildMockInteraction('attendance', { player, team: { value: 'Ghost' } });
      await command.execute(interaction);

      expect(interaction.editReply.mock.calls[0][0].content).toContain('Ghost');
      expect(prisma.raidAttendance.findMany).not.toHaveBeenCalled();
    });
  });

  // ── free-tier upsell hint (RPTIER Phase 5) ──────────────────

  describe('free-tier footer hint', () => {
    const player = { value: 'user-9', user: { id: 'user-9', username: 'Raider', displayName: 'Raider' } };

    const cases: Array<[string, Record<string, any>]> = [
      ['guild', {}],
      ['status', {}],
      ['attendance', { player }],
    ];

    it.each(cases)('appends the hint as content on %s', async (subcommand, options) => {
      (freeTierHint as jest.Mock).mockResolvedValue('\n-# upgrade hint');

      const interaction = buildMockInteraction(subcommand, options);
      await command.execute(interaction);

      expect(freeTierHint).toHaveBeenCalledWith('guild-123', 'en');
      expect(interaction.editReply.mock.calls[0][0].content).toBe('\n-# upgrade hint');
    });

    it.each(cases)('leaves content undefined for premium guilds on %s', async (subcommand, options) => {
      const interaction = buildMockInteraction(subcommand, options);
      await command.execute(interaction);

      expect(interaction.editReply.mock.calls[0][0].content).toBeUndefined();
    });
  });

  // ── raid / suggest: team follows the raid ID ────────────────

  describe('raid-ID based subcommands', () => {
    const raid = {
      id: 'raid-1',
      guildId: 'guild-123',
      teamId: 'team-alpha',
      description: 'Mythic Night',
      raidDate: new Date('2026-03-01T18:00:00Z'),
      attendance: [],
      guild: { id: 'guild-123', language: 'en', timezone: 'UTC' },
    };

    it('shows the raid\'s team in the stats title on multi-team guilds', async () => {
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);
      withMultipleTeams();

      const interaction = buildMockInteraction('raid', { raid_id: { value: 'raid-1' } });
      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.title).toContain('— Alpha');
    });

    it('keeps the stats title unchanged on single-team guilds', async () => {
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);

      const interaction = buildMockInteraction('raid', { raid_id: { value: 'raid-1' } });
      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.title).not.toContain('— Alpha');
    });

    it('shows the raid\'s team in the suggest title on multi-team guilds', async () => {
      (prisma.raid.findUnique as jest.Mock).mockResolvedValue(raid);
      withMultipleTeams();

      const interaction = buildMockInteraction('suggest', { raid_id: { value: 'raid-1' } });
      await command.execute(interaction);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.title).toContain('— Alpha');
    });
  });
});
