/**
 * Cross-command team-scoping suite (RPTIER Phase 6).
 *
 * Where `raid-create.test.ts`, `raid-list.test.ts` and `stats-team.test.ts` assert the team
 * plumbing of one handler each, this suite verifies the scoping end-to-end across handlers:
 * a raid created for team B must not leak into team A's `raid list` or `stats guild`, a clone
 * must stay in its source team, and — the important negative — extra teams must not multiply
 * the FREE weekly raid allowance.
 *
 * Deliberately different from the sibling suites: `entitlementService` is NOT mocked, so the
 * real `tryConsumeWeeklyRaid` runs against the prisma mock's `$transaction` and the guild
 * fixture's counter. `prisma.raid.findMany` is a real filter over a fixture set rather than a
 * fixed resolved value, so "does not show up" is actually observed instead of inferred from
 * the `where` clause alone.
 */

import { canManageRaids } from '../../utils/permissions';

jest.mock('../../database/client');
jest.mock('../../utils/permissions');
jest.mock('../../middleware/premiumGate', () => ({
  gateFeature: jest.fn().mockResolvedValue(true),
  premiumFooterHint: jest.fn().mockReturnValue('-# hint'),
  freeTierHint: jest.fn().mockResolvedValue(''),
}));

import prisma from '../../database/client';
import { clearTierCache } from '../../services/entitlementService';
import raidCommand from '../raid';
import statsCommand from '../stats';

const GUILD_ID = 'guild-123';

const TEAM_MAIN = {
  id: 'team-main',
  guildId: GUILD_ID,
  name: 'Main',
  isDefault: true,
  createdBy: 'system',
};

const TEAM_ALTS = {
  id: 'team-alts',
  guildId: GUILD_ID,
  name: 'Alts',
  isDefault: false,
  createdBy: 'user-leader',
};

const TEAMS = [TEAM_MAIN, TEAM_ALTS];

/** Minimal Collection-like Map covering the discord.js helpers the handlers use. */
class MockCollection<K, V> extends Map<K, V> {
  some(fn: (value: V, key: K, map: this) => boolean): boolean {
    for (const [key, value] of this) if (fn(value, key, this)) return true;
    return false;
  }

  filter(fn: (value: V, key: K, map: this) => boolean): MockCollection<K, V> {
    const result = new MockCollection<K, V>();
    for (const [key, value] of this) if (fn(value, key, this)) result.set(key, value);
    return result;
  }

  find(fn: (value: V, key: K, map: this) => boolean): V | undefined {
    for (const [key, value] of this) if (fn(value, key, this)) return value;
    return undefined;
  }
}

function futureDateStr(daysFromNow = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

/** Mutable guild row — the real `tryConsumeWeeklyRaid` reads and writes its counter. */
let guildRow: Record<string, any>;

/** Raid fixtures the `raid.findMany` mock filters over. */
let raidFixtures: Array<Record<string, any>>;

let createdRaidCount = 0;

/** Builds a `raid`-command interaction for the given subcommand. */
function buildRaidInteraction(subcommand: string, options: Record<string, any> = {}) {
  const rolesCache = new MockCollection<string, any>();
  rolesCache.set('role-raider', { id: 'role-raider', name: 'role-raider' });

  const memberRolesCache = new MockCollection<string, any>();
  memberRolesCache.set('role-raider', { id: 'role-raider', name: 'role-raider' });

  const membersCache = new MockCollection<string, any>();
  membersCache.set('user-200', {
    user: { bot: false, id: 'user-200' },
    roles: { cache: memberRolesCache },
    displayName: 'TankPlayer',
  });
  membersCache.set('user-201', {
    user: { bot: false, id: 'user-201' },
    roles: { cache: memberRolesCache },
    displayName: 'HealerPlayer',
  });

  return {
    isChatInputCommand: jest.fn().mockReturnValue(true),
    guildId: GUILD_ID,
    guild: {
      id: GUILD_ID,
      name: 'Test Guild',
      members: { cache: membersCache, fetch: jest.fn().mockResolvedValue(undefined) },
      roles: { cache: rolesCache },
    },
    channel: {
      id: 'channel-123',
      isTextBased: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue({ id: 'message-new' }),
    },
    member: {
      user: { bot: false, id: 'user-leader' },
      roles: { cache: memberRolesCache },
      displayName: 'Leader',
    },
    user: { id: 'user-leader' },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    client: {
      channels: {
        fetch: jest.fn().mockResolvedValue({
          isTextBased: jest.fn().mockReturnValue(true),
          messages: { fetch: jest.fn() },
        }),
      },
    },
    options: {
      getSubcommand: jest.fn().mockReturnValue(subcommand),
      get: jest.fn((key: string, required?: boolean) =>
        options[key] !== undefined ? options[key] : (required ? { value: null } : undefined)),
    },
  } as any;
}

/** Baseline valid options for `raid create`, optionally scoped to a named team. */
function createOptions(team?: string) {
  const options: Record<string, any> = {
    date: { value: futureDateStr() },
    time: { value: '20:00' },
    title: { value: 'Weekly Raid' },
    roles: { value: 'role-raider' },
    ping_roles: { value: false },
  };
  if (team !== undefined) options.team = { value: team };
  return options;
}

/** Builds a `stats`-command interaction (no member scanning needed). */
function buildStatsInteraction(subcommand: string, options: Record<string, any> = {}) {
  return {
    isChatInputCommand: jest.fn().mockReturnValue(true),
    guild: { id: GUILD_ID, name: 'Test Guild' },
    guildId: GUILD_ID,
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

/** A raid row as `createRaidEmbed` expects to read it back. */
function embedRaid(id: string, teamId = TEAM_MAIN.id) {
  return {
    id,
    guildId: GUILD_ID,
    teamId,
    channelId: 'channel-123',
    raidDate: new Date(Date.now() + 86_400_000),
    description: 'Weekly Raid',
    roles: 'role-raider',
    status: 'open',
    guild: { id: GUILD_ID, language: 'en', timezone: 'UTC' },
    attendance: [
      { userId: 'user-200', username: 'TankPlayer', status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' },
      { userId: 'user-201', username: 'HealerPlayer', status: 'attending', wowClass: 'Priest', wowSpec: 'Holy' },
    ],
  };
}

/** Attendance rows for a raid, used as `stats guild` input. */
function attendanceFor(raidId: string) {
  return [
    { raidId, userId: 'user-200', username: 'TankPlayer', status: 'attending' },
    { raidId, userId: 'user-201', username: 'HealerPlayer', status: 'declined' },
  ];
}

describe('team scoping across raid and stats commands', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearTierCache();
    createdRaidCount = 0;
    raidFixtures = [];

    guildRow = {
      id: GUILD_ID,
      name: 'Test Guild',
      language: 'en',
      timezone: 'UTC',
      raidRoles: 'role-raider',
      raidLeaderRoles: 'role-leader',
      premiumTier: 'PREMIUM',
      premiumExpiresAt: null,
      weeklyRaidCount: 0,
      weeklyRaidCountResetAt: null,
    };

    (canManageRaids as jest.Mock).mockResolvedValue(true);

    (prisma.guild.findUnique as jest.Mock).mockImplementation(async () => guildRow);
    (prisma.guild.update as jest.Mock).mockImplementation(async ({ data }: any) => {
      Object.assign(guildRow, data);
      return guildRow;
    });

    // Serves both the default-team lookup (`isDefault: true`) and the case-insensitive
    // by-name lookup, so a single implementation covers every `resolveTeam` call.
    (prisma.team.findFirst as jest.Mock).mockImplementation(async ({ where }: any) => {
      if (where.isDefault) return TEAM_MAIN;
      const wanted = String(where.name?.equals ?? '').toLowerCase();
      return TEAMS.find((team) => team.name.toLowerCase() === wanted) ?? null;
    });
    (prisma.team.findUnique as jest.Mock).mockImplementation(async ({ where }: any) =>
      TEAMS.find((team) => team.id === where.id) ?? null);
    (prisma.team.count as jest.Mock).mockResolvedValue(TEAMS.length);

    // Real filtering rather than a canned result — team leakage becomes observable.
    (prisma.raid.findMany as jest.Mock).mockImplementation(async ({ where }: any) =>
      raidFixtures.filter((raid) => {
        if (where.guildId && raid.guildId !== where.guildId) return false;
        if (where.teamId && raid.teamId !== where.teamId) return false;
        if (where.status && raid.status !== where.status) return false;
        if (where.raidDate?.gte && raid.raidDate < where.raidDate.gte) return false;
        return true;
      }));

    (prisma.raid.findUnique as jest.Mock).mockImplementation(async ({ where }: any) =>
      raidFixtures.find((raid) => raid.id === where.id) ?? embedRaid(where.id));

    (prisma.raid.create as jest.Mock).mockImplementation(async ({ data }: any) => ({
      id: `raid-created-${++createdRaidCount}`,
      ...data,
    }));
    (prisma.raid.update as jest.Mock).mockResolvedValue({});
    (prisma.raidAttendance.createMany as jest.Mock).mockResolvedValue({ count: 2 });
    (prisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.userPreference.upsert as jest.Mock).mockResolvedValue({});
    (prisma.userPreference.findMany as jest.Mock).mockResolvedValue([]);
  });

  // ── raid create ─────────────────────────────────────────────

  describe('raid create', () => {
    it('writes the default team when no team option is given', async () => {
      await raidCommand.execute(buildRaidInteraction('create', createOptions()));

      expect(prisma.raid.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ teamId: TEAM_MAIN.id }) })
      );
      const attendance = (prisma.raidAttendance.createMany as jest.Mock).mock.calls[0][0].data;
      expect(attendance.every((row: any) => row.teamId === TEAM_MAIN.id)).toBe(true);
    });

    it('writes the named team when the team option is given', async () => {
      await raidCommand.execute(buildRaidInteraction('create', createOptions('Alts')));

      expect(prisma.raid.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ teamId: TEAM_ALTS.id }) })
      );
    });

    it('resolves the team name case-insensitively', async () => {
      await raidCommand.execute(buildRaidInteraction('create', createOptions('aLtS')));

      expect(prisma.raid.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ teamId: TEAM_ALTS.id }) })
      );
    });

    it('reports an unknown team and inserts nothing', async () => {
      const interaction = buildRaidInteraction('create', createOptions('Ghosts'));

      await raidCommand.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Ghosts') })
      );
      expect(prisma.raid.create).not.toHaveBeenCalled();
      expect(prisma.raidAttendance.createMany).not.toHaveBeenCalled();
    });
  });

  // ── raid list ───────────────────────────────────────────────

  describe('raid list', () => {
    beforeEach(() => {
      raidFixtures = [
        { ...embedRaid('raid-main-1', TEAM_MAIN.id), description: 'Main Night' },
        { ...embedRaid('raid-alts-1', TEAM_ALTS.id), description: 'Alts Night' },
      ];
    });

    it('hides raids of other teams from the default team listing', async () => {
      const interaction = buildRaidInteraction('list');

      await raidCommand.execute(interaction);

      const [reply] = interaction.editReply.mock.calls.at(-1);
      const rendered = JSON.stringify(reply.embeds[0].data);
      expect(rendered).toContain('Main Night');
      expect(rendered).not.toContain('Alts Night');
    });

    it('shows only the named team\'s raids when the team option is given', async () => {
      const interaction = buildRaidInteraction('list', { team: { value: 'Alts' } });

      await raidCommand.execute(interaction);

      const [reply] = interaction.editReply.mock.calls.at(-1);
      const rendered = JSON.stringify(reply.embeds[0].data);
      expect(rendered).toContain('Alts Night');
      expect(rendered).not.toContain('Main Night');
    });

    it('reports an empty listing for a team without raids', async () => {
      raidFixtures = [{ ...embedRaid('raid-alts-1', TEAM_ALTS.id), description: 'Alts Night' }];
      const interaction = buildRaidInteraction('list');

      await raidCommand.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('No upcoming raids') })
      );
    });
  });

  // ── raid clone ──────────────────────────────────────────────

  describe('raid clone', () => {
    /** Source raid living in the non-default team. */
    function altsSourceRaid() {
      return {
        ...embedRaid('source-raid-1', TEAM_ALTS.id),
        description: 'Alts Night',
        createdBy: 'user-leader',
        messageId: 'msg-original',
        createdFromTemplateId: null,
        clonedAt: null,
        isTemplate: false,
      };
    }

    it('carries the source raid\'s team over to the clone', async () => {
      raidFixtures = [altsSourceRaid()];

      await raidCommand.execute(buildRaidInteraction('clone', {
        raid_id: { value: 'source-raid-1' },
        date: { value: futureDateStr() },
      }));

      expect(prisma.raid.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            teamId: TEAM_ALTS.id,
            createdFromTemplateId: 'source-raid-1',
          }),
        })
      );
      const attendance = (prisma.raidAttendance.createMany as jest.Mock).mock.calls[0][0].data;
      expect(attendance.every((row: any) => row.teamId === TEAM_ALTS.id)).toBe(true);
    });

    it('falls back to the default team for a pre-migration source raid', async () => {
      raidFixtures = [{ ...altsSourceRaid(), teamId: null }];

      await raidCommand.execute(buildRaidInteraction('clone', {
        raid_id: { value: 'source-raid-1' },
        date: { value: futureDateStr() },
      }));

      expect(prisma.raid.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ teamId: TEAM_MAIN.id }) })
      );
    });

    it('lets an explicit team option override the source team', async () => {
      raidFixtures = [{ ...altsSourceRaid(), teamId: TEAM_ALTS.id }];

      await raidCommand.execute(buildRaidInteraction('clone', {
        raid_id: { value: 'source-raid-1' },
        date: { value: futureDateStr() },
        team: { value: 'Main' },
      }));

      expect(prisma.raid.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ teamId: TEAM_MAIN.id }) })
      );
    });
  });

  // ── stats guild ─────────────────────────────────────────────

  describe('stats guild', () => {
    beforeEach(() => {
      const recent = new Date(Date.now() - 2 * 86_400_000);
      raidFixtures = [
        {
          ...embedRaid('raid-main-1', TEAM_MAIN.id),
          raidDate: recent,
          attendance: attendanceFor('raid-main-1'),
        },
        {
          ...embedRaid('raid-alts-1', TEAM_ALTS.id),
          raidDate: recent,
          attendance: attendanceFor('raid-alts-1'),
        },
        {
          ...embedRaid('raid-alts-2', TEAM_ALTS.id),
          raidDate: recent,
          attendance: attendanceFor('raid-alts-2'),
        },
      ];
    });

    /** Reads the "total raids" figure out of the guild-stats embed. */
    function totalRaidsIn(interaction: any): string {
      const embed = interaction.editReply.mock.calls.at(-1)[0].embeds[0];
      const field = embed.data.fields.find((f: any) => /raid/i.test(f.name));
      return field.value;
    }

    it('aggregates only the default team\'s raids', async () => {
      const interaction = buildStatsInteraction('guild');

      await statsCommand.execute(interaction);

      const args = (prisma.raid.findMany as jest.Mock).mock.calls[0][0];
      expect(args.where.teamId).toBe(TEAM_MAIN.id);
      expect(totalRaidsIn(interaction)).toBe('1');
    });

    it('aggregates only the named team\'s raids', async () => {
      const interaction = buildStatsInteraction('guild', { team: { value: 'Alts' } });

      await statsCommand.execute(interaction);

      const args = (prisma.raid.findMany as jest.Mock).mock.calls[0][0];
      expect(args.where.teamId).toBe(TEAM_ALTS.id);
      expect(totalRaidsIn(interaction)).toBe('2');
    });
  });

  // ── weekly raid limit is guild-wide ─────────────────────────

  describe('FREE weekly raid limit', () => {
    beforeEach(() => {
      guildRow.premiumTier = 'FREE';
    });

    it('shares the free quota across teams instead of granting one per team', async () => {
      // Five creates alternating between Main and Alts — the sixth must be blocked no
      // matter which team it targets, otherwise multi-team would be a limit bypass.
      const teams = ['Main', 'Alts', 'Main', 'Alts', 'Main'];
      for (const team of teams) {
        const interaction = buildRaidInteraction('create', createOptions(team));
        await raidCommand.execute(interaction);
        expect(interaction.editReply).toHaveBeenCalledWith(
          expect.objectContaining({ content: expect.stringContaining('created successfully') })
        );
      }

      expect(prisma.raid.create).toHaveBeenCalledTimes(5);
      expect(guildRow.weeklyRaidCount).toBe(5);

      const blocked = buildRaidInteraction('create', createOptions('Alts'));
      await raidCommand.execute(blocked);

      expect(blocked.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Weekly raid limit reached') })
      );
      expect(prisma.raid.create).toHaveBeenCalledTimes(5);
    });

    it('keeps the quota unlimited for premium guilds across teams', async () => {
      guildRow.premiumTier = 'PREMIUM';

      for (let i = 0; i < 6; i++) {
        await raidCommand.execute(buildRaidInteraction('create', createOptions(i % 2 ? 'Alts' : 'Main')));
      }

      expect(prisma.raid.create).toHaveBeenCalledTimes(6);
      expect(guildRow.weeklyRaidCount).toBe(0);
    });
  });
});
