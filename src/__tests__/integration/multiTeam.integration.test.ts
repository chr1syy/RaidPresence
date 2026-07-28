/**
 * Multi-Team Lifecycle Integration Test (RPTIER Phase 6)
 *
 * Walks one guild through the whole two-tier multi-team story, in order, against a
 * single mutable in-memory store:
 *   1. onboarding                → the default "Main" team is provisioned
 *   2. FREE hits the team gate   → no team is written, an ephemeral upsell goes out
 *   3. trial grant               → the guild becomes PREMIUM
 *   4. PREMIUM creates team B    → `/team create` succeeds
 *   5. raids in A and B          → each raid carries its own teamId
 *   6. `stats guild` for team A  → team B's raid is not aggregated
 *   7. premium expires           → existing teams and raids stay intact and readable,
 *                                  but a further team is blocked again
 *
 * Step 7 is the important one: a downgrade must never delete or hide data.
 *
 * Unlike the sibling command suites, neither `entitlementService` nor `premiumGate` is
 * mocked here — the real tier lookup, the real `canCreateAdditionalTeam` and the real
 * `gateFeature` run against the store, so the upsell embed and the downgrade behaviour
 * are observed rather than stubbed. Only `permissions` is mocked (Discord role checks).
 *
 * The `it` blocks share state deliberately and must run in file order; each step builds
 * on the state the previous one left behind.
 */

import { Prisma } from '@prisma/client';

jest.mock('../../database/client');
jest.mock('../../utils/permissions');

import prisma from '../../database/client';
import { canManageRaids } from '../../utils/permissions';
import {
  clearTierCache,
  getTier,
  grantTrialIfEligible,
  TRIAL_DAYS,
} from '../../services/entitlementService';
import { getDefaultTeam, DEFAULT_TEAM_NAME } from '../../services/teamService';
import teamCommand from '../../commands/team';
import raidCommand from '../../commands/raid';
import statsCommand from '../../commands/stats';

const GUILD_ID = 'guild-multi-team';
const ADMIN_ID = 'user-admin';

// ─── In-memory store ──────────────────────────────────────────────

interface TeamRow {
  id: string;
  guildId: string;
  name: string;
  isDefault: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const db = {
  guild: {
    id: GUILD_ID,
    name: 'Multi Team Guild',
    language: 'en',
    timezoneOffset: 0,
    raidRoles: 'role-raider',
    raidLeaderRoles: 'role-leader',
    premiumTier: 'FREE',
    premiumExpiresAt: null as Date | null,
    entitlementId: null as string | null,
    trialStartedAt: null as Date | null,
    weeklyRaidCount: 0,
    weeklyRaidCountResetAt: null as Date | null,
  } as Record<string, any>,
  teams: [] as TeamRow[],
  raids: [] as Array<Record<string, any>>,
  attendance: [] as Array<Record<string, any>>,
};

let teamSeq = 0;
let raidSeq = 0;

/** The P2002 Prisma raises when `@@unique([guildId, name])` is violated. */
function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target: ['guildId', 'name'] },
  });
}

function teamByName(guildId: string, name: string): TeamRow | undefined {
  return db.teams.find(
    (team) => team.guildId === guildId && team.name.toLowerCase() === name.toLowerCase()
  );
}

/** A raid row with its attendance attached, as `include: { attendance: true }` returns it. */
function hydrateRaid(raid: Record<string, any>) {
  return {
    ...raid,
    attendance: db.attendance.filter((row) => row.raidId === raid.id),
    guild: db.guild,
  };
}

/** Wires every prisma method the exercised code paths touch to the store above. */
function installStoreMocks() {
  (prisma.guild.findUnique as jest.Mock).mockImplementation(async ({ where }: any) =>
    where.id === db.guild.id ? { ...db.guild } : null
  );
  (prisma.guild.update as jest.Mock).mockImplementation(async ({ where, data }: any) => {
    if (where.id !== db.guild.id) throw new Error(`unknown guild ${where.id}`);
    Object.assign(db.guild, data);
    return { ...db.guild };
  });
  // `grantTrialIfEligible` puts its eligibility predicate into the WHERE clause, so the
  // mock has to actually evaluate it instead of blindly writing.
  (prisma.guild.updateMany as jest.Mock).mockImplementation(async ({ where, data }: any) => {
    const matches = Object.entries(where).every(
      ([key, value]) => db.guild[key] === value || (value === null && db.guild[key] == null)
    );
    if (!matches) return { count: 0 };
    Object.assign(db.guild, data);
    return { count: 1 };
  });

  (prisma.team.findFirst as jest.Mock).mockImplementation(async ({ where }: any) => {
    if (where.isDefault) {
      return db.teams.find((team) => team.guildId === where.guildId && team.isDefault) ?? null;
    }
    return teamByName(where.guildId, String(where.name?.equals ?? '')) ?? null;
  });
  (prisma.team.findUnique as jest.Mock).mockImplementation(
    async ({ where }: any) => db.teams.find((team) => team.id === where.id) ?? null
  );
  (prisma.team.findMany as jest.Mock).mockImplementation(async ({ where }: any) =>
    db.teams
      .filter((team) => team.guildId === where.guildId)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))
  );
  (prisma.team.count as jest.Mock).mockImplementation(
    async ({ where }: any) => db.teams.filter((team) => team.guildId === where.guildId).length
  );
  (prisma.team.create as jest.Mock).mockImplementation(async ({ data }: any) => {
    if (teamByName(data.guildId, data.name)) throw uniqueConstraintError();
    const now = new Date();
    const row: TeamRow = { id: `team-${++teamSeq}`, createdAt: now, updatedAt: now, ...data };
    db.teams.push(row);
    return row;
  });
  (prisma.team.delete as jest.Mock).mockImplementation(async ({ where }: any) => {
    const index = db.teams.findIndex((team) => team.id === where.id);
    const [removed] = db.teams.splice(index, 1);
    // Mirror the schema's cascade so "nothing was deleted" assertions stay meaningful.
    db.raids = db.raids.filter((raid) => raid.teamId !== where.id);
    return removed;
  });

  (prisma.raid.create as jest.Mock).mockImplementation(async ({ data }: any) => {
    const row = { id: `raid-${++raidSeq}`, status: 'open', ...data };
    db.raids.push(row);
    return row;
  });
  (prisma.raid.update as jest.Mock).mockImplementation(async ({ where, data }: any) => {
    const raid = db.raids.find((row) => row.id === where.id);
    if (raid) Object.assign(raid, data);
    return raid;
  });
  (prisma.raid.findUnique as jest.Mock).mockImplementation(async ({ where }: any) => {
    const raid = db.raids.find((row) => row.id === where.id);
    return raid ? hydrateRaid(raid) : null;
  });
  (prisma.raid.findMany as jest.Mock).mockImplementation(async ({ where }: any) =>
    db.raids
      .filter((raid) => {
        if (where.guildId && raid.guildId !== where.guildId) return false;
        if (where.teamId && raid.teamId !== where.teamId) return false;
        if (where.status && raid.status !== where.status) return false;
        if (where.raidDate?.gte && raid.raidDate < where.raidDate.gte) return false;
        return true;
      })
      .map(hydrateRaid)
  );
  (prisma.raid.count as jest.Mock).mockImplementation(async ({ where }: any) =>
    db.raids.filter((raid) => !where?.teamId || raid.teamId === where.teamId).length
  );

  (prisma.raidAttendance.createMany as jest.Mock).mockImplementation(async ({ data }: any) => {
    const rows = Array.isArray(data) ? data : [data];
    db.attendance.push(...rows);
    return { count: rows.length };
  });
  (prisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.userPreference.upsert as jest.Mock).mockResolvedValue({});
  (prisma.userPreference.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.userRolePreference.findMany as jest.Mock).mockResolvedValue([]);
}

// ─── Interaction helpers ──────────────────────────────────────────

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

function baseInteraction() {
  return {
    isChatInputCommand: jest.fn().mockReturnValue(true),
    guildId: GUILD_ID,
    guild: { id: GUILD_ID, name: db.guild.name },
    user: { id: ADMIN_ID },
    member: { user: { bot: false, id: ADMIN_ID }, roles: { cache: new MockCollection() } },
    channel: { id: 'channel-1' },
    replied: false,
    deferred: false,
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  };
}

/** `/team <subcommand> [name:…]` */
function buildTeamInteraction(subcommand: string, name?: string) {
  return {
    ...baseInteraction(),
    options: {
      getSubcommand: jest.fn().mockReturnValue(subcommand),
      getString: jest.fn(() => name ?? null),
    },
  } as any;
}

/** `/raid <subcommand> [team:…]` — carries the member/role cache raid create scans. */
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
    ...baseInteraction(),
    guild: {
      id: GUILD_ID,
      name: db.guild.name,
      members: { cache: membersCache, fetch: jest.fn().mockResolvedValue(undefined) },
      roles: { cache: rolesCache },
    },
    member: {
      user: { bot: false, id: ADMIN_ID },
      roles: { cache: memberRolesCache },
      displayName: 'Admin',
    },
    channel: {
      id: 'channel-1',
      isTextBased: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue({ id: 'message-new' }),
    },
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
        options[key] !== undefined ? options[key] : required ? { value: null } : undefined
      ),
    },
  } as any;
}

/** Baseline valid `raid create` options, optionally scoped to a named team. */
function createOptions(title: string, team?: string) {
  const options: Record<string, any> = {
    date: { value: futureDateStr() },
    time: { value: '20:00' },
    title: { value: title },
    roles: { value: 'role-raider' },
    ping_roles: { value: false },
  };
  if (team !== undefined) options.team = { value: team };
  return options;
}

/** `/stats <subcommand> [team:…]` */
function buildStatsInteraction(subcommand: string, options: Record<string, any> = {}) {
  return {
    ...baseInteraction(),
    options: {
      getSubcommand: jest.fn().mockReturnValue(subcommand),
      get: jest.fn((key: string, required?: boolean) =>
        options[key] || (required ? { value: null } : undefined)
      ),
    },
  } as any;
}

/** Last reply payload sent through `reply` or `editReply`. */
function lastReply(interaction: any): any {
  const calls = [
    ...interaction.reply.mock.calls,
    ...interaction.editReply.mock.calls,
  ];
  return calls.at(-1)?.[0];
}

// ─── Lifecycle ────────────────────────────────────────────────────

describe('multi-team lifecycle', () => {
  beforeAll(() => {
    installStoreMocks();
    (canManageRaids as jest.Mock).mockResolvedValue(true);
  });

  beforeEach(() => {
    clearTierCache();
  });

  // 1 ── onboarding ───────────────────────────────────────────────

  it('provisions a default team when the guild is onboarded', async () => {
    const team = await getDefaultTeam(GUILD_ID);

    expect(team).toMatchObject({ guildId: GUILD_ID, name: DEFAULT_TEAM_NAME, isDefault: true });
    expect(db.teams).toHaveLength(1);
    expect(await getTier(GUILD_ID)).toBe('FREE');
  });

  // 2 ── FREE hits the gate ───────────────────────────────────────

  it('blocks a second team on the free tier and answers with an ephemeral upsell', async () => {
    const interaction = buildTeamInteraction('create', 'Alts');

    await teamCommand.execute(interaction);

    expect(db.teams).toHaveLength(1);
    expect(prisma.team.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Alts' }) })
    );

    const reply = interaction.reply.mock.calls.at(-1)[0];
    expect(reply.ephemeral).toBe(true);
    const embed = reply.embeds[0].data;
    expect(embed.title).toContain('Multiple Teams');
    // The perks field sells premium regardless of which feature triggered the gate.
    expect(embed.fields.some((f: any) => f.name.includes('Premium'))).toBe(true);
  });

  // 3 ── trial ────────────────────────────────────────────────────

  it('flips the guild to premium when the trial is granted', async () => {
    const trial = await grantTrialIfEligible(GUILD_ID);

    expect(trial).toMatchObject({ granted: true, tier: 'PREMIUM' });
    const daysGranted = Math.round(
      (trial.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );
    expect(daysGranted).toBe(TRIAL_DAYS);
    expect(await getTier(GUILD_ID)).toBe('PREMIUM');
  });

  // 4 ── premium creates team B ───────────────────────────────────

  it('creates the second team once premium is active', async () => {
    const interaction = buildTeamInteraction('create', 'Alts');

    await teamCommand.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Alts') })
    );
    expect(db.teams).toHaveLength(2);
    expect(teamByName(GUILD_ID, 'Alts')).toMatchObject({ isDefault: false, createdBy: ADMIN_ID });
  });

  // 5 ── raids per team ───────────────────────────────────────────

  it('creates raids in both teams, each carrying its own teamId', async () => {
    await raidCommand.execute(buildRaidInteraction('create', createOptions('Main Night')));
    await raidCommand.execute(
      buildRaidInteraction('create', createOptions('Alts Night', 'Alts'))
    );

    const main = teamByName(GUILD_ID, DEFAULT_TEAM_NAME)!;
    const alts = teamByName(GUILD_ID, 'Alts')!;

    expect(db.raids).toHaveLength(2);
    expect(db.raids.find((r) => r.description === 'Main Night')!.teamId).toBe(main.id);
    expect(db.raids.find((r) => r.description === 'Alts Night')!.teamId).toBe(alts.id);
    // Attendance rows inherit the raid's team, so per-team stats stay consistent.
    expect(db.attendance.every((row) => [main.id, alts.id].includes(row.teamId))).toBe(true);
  });

  // 6 ── team-scoped aggregation ──────────────────────────────────

  it('keeps team B\'s raid out of team A\'s guild stats', async () => {
    const interaction = buildStatsInteraction('guild', { period: { value: 'month' } });

    await statsCommand.execute(interaction);

    const embed = lastReply(interaction).embeds[0];
    const totalRaids = embed.data.fields.find((f: any) => /raid/i.test(f.name)).value;
    expect(totalRaids).toBe('1');
    expect(JSON.stringify(embed.data)).not.toContain('Alts Night');

    const altsInteraction = buildStatsInteraction('guild', {
      period: { value: 'month' },
      team: { value: 'Alts' },
    });
    await statsCommand.execute(altsInteraction);
    const altsEmbed = lastReply(altsInteraction).embeds[0];
    expect(altsEmbed.data.fields.find((f: any) => /raid/i.test(f.name)).value).toBe('1');
  });

  // 7 ── downgrade ────────────────────────────────────────────────

  describe('after premium expires', () => {
    beforeAll(() => {
      db.guild.premiumExpiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
      clearTierCache();
    });

    it('falls back to the free tier', async () => {
      expect(await getTier(GUILD_ID)).toBe('FREE');
    });

    it('keeps both teams — nothing is deleted on downgrade', async () => {
      const interaction = buildTeamInteraction('list');

      await teamCommand.execute(interaction);

      expect(db.teams).toHaveLength(2);
      expect(prisma.team.delete).not.toHaveBeenCalled();

      const rendered = JSON.stringify(lastReply(interaction).embeds[0].data);
      expect(rendered).toContain(DEFAULT_TEAM_NAME);
      expect(rendered).toContain('Alts');
      // The free-tier nudge rides along, but the listing itself stays complete.
      expect(lastReply(interaction).content).toContain('Premium');
    });

    it('still lists the raids of the extra team', async () => {
      const interaction = buildRaidInteraction('list', { team: { value: 'Alts' } });

      await raidCommand.execute(interaction);

      const rendered = JSON.stringify(lastReply(interaction).embeds[0].data);
      expect(rendered).toContain('Alts Night');
      expect(db.raids).toHaveLength(2);
    });

    it('blocks creating a further team again, without touching existing data', async () => {
      const interaction = buildTeamInteraction('create', 'Trials');

      await teamCommand.execute(interaction);

      const reply = interaction.reply.mock.calls.at(-1)[0];
      expect(reply.ephemeral).toBe(true);
      expect(reply.embeds[0].data.title).toContain('Multiple Teams');

      expect(db.teams).toHaveLength(2);
      expect(db.raids).toHaveLength(2);
      expect(teamByName(GUILD_ID, 'Trials')).toBeUndefined();
    });
  });
});
